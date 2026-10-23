"""Jarvis PC agent.

Runs on a laptop/desktop you own. It only makes OUTBOUND HTTPS calls to your
Jarvis server (no open ports), asks "anything for me?" every few seconds and
runs a small fixed set of actions. Anything not on the list is refused here
even if the server asks for it.
"""
import ctypes
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from urllib.parse import urlparse

import psutil
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")

ENGINES = ("claude", "gemini", "codex")
AI_ACTIONS = {f"{e}_{m}" for e in ENGINES for m in ("read", "work")}
ALL_ACTIONS = {"cpu_status", "speak", "open_url", "open_app", "lock", "shutdown", "restart", "cancel_shutdown",
               "brain_chat", "screen_look", "claude_sessions", "window_read"} | AI_ACTIONS
STATE_PATH = os.path.join(HERE, "state.json")

# Headless AI coding CLIs. Override any key under "claude" / "gemini" / "codex" in config.json.
CLAUDE_DEFAULTS = {
    "command": "claude",  # or a list with the full path, e.g. ["C:\\Users\\you\\.local\\bin\\claude.exe"]
    "max_turns": 25,
    "max_budget_usd": 2.0,
    "read": {
        "permission_mode": "default",
        "tools": "Read,Grep,Glob,Bash",
        "allowed": ["Read", "Grep", "Glob", "Bash(git status *)", "Bash(git log *)", "Bash(git diff *)"],
    },
    "work": {
        "permission_mode": "acceptEdits",
        "tools": "Read,Grep,Glob,Edit,Write,Bash",
        "allowed": ["Read", "Grep", "Glob", "Edit", "Write", "Bash(git status *)", "Bash(git diff *)",
                    "Bash(php -l *)", "Bash(node --check *)", "Bash(python -m py_compile *)"],
    },
}
GEMINI_DEFAULTS = {"command": "gemini", "read": {"approval_mode": "plan"}, "work": {"approval_mode": "auto_edit"}}
CODEX_DEFAULTS = {"command": "codex", "read": {"sandbox": "read-only"}, "work": {"sandbox": "workspace-write"}}
DEFAULTS = {"claude": CLAUDE_DEFAULTS, "gemini": GEMINI_DEFAULTS, "codex": CODEX_DEFAULTS}


def load_config():
    if not os.path.exists(CONFIG_PATH):
        sys.exit("config.json nahi mila. config.sample.json copy karke token daalo.")
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    url = cfg.get("server_url", "").rstrip("/") + "/"
    host = urlparse(url).hostname or ""
    if not url.startswith("https://") and host not in ("localhost", "127.0.0.1"):
        sys.exit("server_url https:// se shuru hona chahiye (sirf localhost par http chalta hai).")
    if len(cfg.get("token", "")) != 64:
        sys.exit("config.json me token galat hai (64 akshar ka hona chahiye).")
    cfg["server_url"] = url
    cfg.setdefault("poll_seconds", 4)
    cfg.setdefault("apps", {})  # {"notepad": "C:\\Windows\\notepad.exe"}
    cfg.setdefault("projects", {})  # {"jarvis": "C:\\xampp\\htdocs\\ai"}: the only folders the AI CLIs may work in
    cfg.setdefault("ai_timeout_minutes", 30)
    for engine in ENGINES:
        merged = {**DEFAULTS[engine], **cfg.get(engine, {})}
        for mode in ("read", "work"):
            merged[mode] = {**DEFAULTS[engine][mode], **merged.get(mode, {})}
        cfg[engine] = merged
    # *_work (can edit files) stays off unless you list it in allowed_actions yourself.
    default_allowed = ALL_ACTIONS - {f"{e}_work" for e in ENGINES}
    cfg["allowed_actions"] = set(cfg.get("allowed_actions", default_allowed)) & ALL_ACTIONS
    return cfg


def cpu_status():
    parts = [f"CPU {psutil.cpu_percent(interval=0.5)}%", f"RAM {psutil.virtual_memory().percent}%"]
    battery = psutil.sensors_battery()
    if battery:
        parts.append(f"Battery {battery.percent:.0f}%" + (" (charging)" if battery.power_plugged else ""))
    return ", ".join(parts)


def speak(text):
    import pyttsx3  # optional dependency
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()
    return "bol diya"


def open_url(url):
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError("sirf http/https allowed")
    webbrowser.open(url)
    return "khul gaya"


def load_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sessions": {}}


def save_state(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_PATH)


# npm installs gemini/codex as .cmd shims; run their JS entry point with node instead, because a .cmd would
# pass the prompt through cmd.exe where & | > in the text become commands.
NPM_ENTRY = {
    "gemini": os.path.join("node_modules", "@google", "gemini-cli", "bundle", "gemini.js"),
    "codex": os.path.join("node_modules", "@openai", "codex", "bin", "codex.js"),
}


def cli_executable(cfg, engine):
    command = cfg[engine]["command"]
    if isinstance(command, list):
        return list(command)
    path = shutil.which(command)
    if not path and engine == "claude":
        fallback = os.path.join(os.path.expanduser("~"), ".local", "bin", "claude.exe")
        path = fallback if os.path.exists(fallback) else None
    if not path:
        raise FileNotFoundError(f"{engine} CLI nahi mila. Install karke login karo, ya config.json me {engine}.command me poora path do.")
    if path.lower().endswith((".cmd", ".bat", ".ps1")):
        entry = NPM_ENTRY.get(engine)
        script = os.path.join(os.path.dirname(path), entry) if entry else None
        node = shutil.which("node")
        if script and node and os.path.exists(script):
            return [node, script]
        raise PermissionError(f"{engine}: .cmd shim support nahi hai; config.json me {engine}.command ko [node, script] list do.")
    return [path]


def kill_tree(proc):
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()


def build_command(cfg, engine, mode, prompt, path, resume, state_project):
    """Returns (argv, reader) where reader(stdout, stderr, returncode) -> (answer text, session id or None)."""
    spec = cfg[engine][mode]
    exe = cli_executable(cfg, engine)

    if engine == "claude":
        cmd = exe + ["-p", prompt, "--output-format", "json", "--permission-mode", spec["permission_mode"],
                     "--tools", spec["tools"], "--max-turns", str(cfg["claude"]["max_turns"]),
                     "--max-budget-usd", str(cfg["claude"]["max_budget_usd"])]
        if resume and state_project.get("claude"):
            cmd += ["--resume", state_project["claude"]]
        cmd += ["--allowedTools", *spec["allowed"]]  # variadic flag goes last so it can't swallow the prompt

        def read(out, err, code):
            j = json.loads(out)
            tail = "\n\n\u2014 claude \u00b7 session {} \u00b7 ${:.2f}".format(str(j.get("session_id", "?"))[:8], float(j.get("total_cost_usd") or 0))
            if j.get("is_error"):
                raise RuntimeError(str(j.get("result") or "claude error") + tail)
            return str(j.get("result") or "(khali jawab)") + tail, j.get("session_id")
        return cmd, read, None

    if engine == "gemini":
        cmd = exe + ["-p", prompt, "--output-format", "json", "--approval-mode", spec["approval_mode"]]
        if resume:
            cmd += ["--resume", "latest"]  # latest session of this project folder

        def read(out, err, code):
            j = json.loads(out)
            if j.get("error"):
                raise RuntimeError(str(j["error"])[:2000])
            return str(j.get("response") or "(khali jawab)") + "\n\n\u2014 gemini", None
        return cmd, read, None

    # codex: the final message is written to a file; -s picks the sandbox, no approvals are ever asked
    import tempfile
    fd, last = tempfile.mkstemp(prefix="jarvis_codex_", suffix=".txt")
    os.close(fd)
    cmd = exe + ["exec", "-C", path, "-s", spec["sandbox"], "--skip-git-repo-check", "-o", last]
    if resume:
        cmd += ["resume", "--last"]
    cmd += [prompt]

    def read(out, err, code):
        with open(last, encoding="utf-8", errors="replace") as f:
            text = f.read().strip()
        if code != 0 or not text:
            raise RuntimeError((text or err.strip() or out.strip() or f"exit code {code}")[:2000])
        return text + "\n\n\u2014 codex", None
    return cmd, read, last


BRAIN_DIR = os.path.join(HERE, "brain_workdir")  # empty folder: the brain must have nothing to read or edit


def run_brain(cfg, args):
    """Chat brain: ask a logged-in AI CLI (your own subscription) to answer with Jarvis's JSON plan.
    No tools are enabled, the prompt goes in over stdin, and the reply text is returned for the server to act on."""
    engine = str(args.get("engine", "codex"))
    if engine not in ENGINES:
        raise ValueError("unknown engine: " + engine)
    prompt = str(args.get("prompt", ""))
    if not prompt.strip():
        raise ValueError("prompt khali hai")
    os.makedirs(BRAIN_DIR, exist_ok=True)
    exe = cli_executable(cfg, engine)
    temp_file = None
    if engine == "claude":
        cmd = exe + ["-p", "--output-format", "json", "--tools", "", "--max-turns", "3", "--permission-mode", "default"]
    elif engine == "gemini":
        cmd = exe + ["-p", "Follow the instructions given on stdin and answer with only the JSON object they ask for.",
                     "--output-format", "json", "--approval-mode", "plan"]
    else:
        import tempfile
        fd, temp_file = tempfile.mkstemp(prefix="jarvis_brain_", suffix=".txt")
        os.close(fd)
        cmd = exe + ["exec", "-C", BRAIN_DIR, "-s", "read-only", "--skip-git-repo-check", "-o", temp_file, "-"]
    try:
        proc = subprocess.Popen(cmd, cwd=BRAIN_DIR, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace")
        try:
            out, err = proc.communicate(prompt, timeout=cfg.get("brain_timeout_seconds", 150))
        except subprocess.TimeoutExpired:
            kill_tree(proc)
            raise TimeoutError(f"{engine} ne jawab nahi diya (timeout)")
        if engine == "codex":
            with open(temp_file, encoding="utf-8", errors="replace") as f:
                text = f.read().strip()
        else:
            try:
                j = json.loads(out)
            except ValueError:
                raise RuntimeError((out.strip() or err.strip() or f"exit code {proc.returncode}")[:1500])
            if j.get("is_error") or j.get("error"):
                raise RuntimeError(str(j.get("result") or j.get("error"))[:1500])
            text = str((j.get("result") if engine == "claude" else j.get("response")) or "").strip()
        if proc.returncode != 0 or not text:
            raise RuntimeError((text or err.strip() or out.strip() or f"exit code {proc.returncode}")[:1500])
        return text
    finally:
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)


def _text_of(content):
    """Plain text from a transcript message (a string or a list of blocks); tool results and tags are skipped."""
    if isinstance(content, str):
        parts = [content]
    else:
        parts = [b.get("text", "") for b in (content or []) if isinstance(b, dict) and b.get("type") == "text"]
    text = " ".join(p.strip() for p in parts if p.strip() and not p.strip().startswith("[Image"))
    return "" if text.startswith("<") else text  # <system-reminder>, <command-...> and similar injected tags


def _short(text, n=170):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def summarize_session(path, now):
    """What one Claude Code session is doing, read from the tail of its local transcript (.jsonl)."""
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(max(0, size - 1_500_000))
        lines = f.read().decode("utf-8", errors="replace").splitlines()[1 if size > 1_500_000 else 0:]
    title = cwd = last_user = last_text = last_tool = None
    for line in lines:
        try:
            j = json.loads(line)
        except ValueError:
            continue
        t = j.get("type")
        if t == "custom-title" and j.get("customTitle"):
            title = j["customTitle"]
        if j.get("cwd"):
            cwd = j["cwd"]
        if j.get("isSidechain"):
            continue
        msg = j.get("message") if isinstance(j.get("message"), dict) else {}
        if t == "user":
            text = _text_of(msg.get("content"))
            if text:
                last_user = text
        elif t == "assistant" and isinstance(msg.get("content"), list):
            for b in msg["content"]:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and b.get("text", "").strip():
                    last_text = b["text"]
                elif b.get("type") == "tool_use":
                    inp = b.get("input") or {}
                    detail = inp.get("description") or inp.get("command") or inp.get("file_path") or inp.get("pattern") or inp.get("url") or ""
                    last_tool = f"{b.get('name')}: {_short(detail, 110)}" if detail else str(b.get("name"))
    age = now - os.path.getmtime(path)
    if age < 120:
        state = "CHAL RAHA HAI (abhi activity)"
    elif age < 3600:
        state = f"ruka hua, {int(age // 60)} min pehle tak chala"
    else:
        state = f"band, {age / 3600:.1f} ghante pehle tak chala"
    out = [f"• {title or '(bina naam)'} — {state}", f"  folder: {cwd or os.path.basename(os.path.dirname(path))}"]
    if last_user:
        out.append(f"  aapne aakhri baar: \"{_short(last_user)}\"")
    if last_text:
        out.append(f"  Claude ne aakhri baar: \"{_short(last_text, 220)}\"")
    if last_tool:
        out.append(f"  aakhri kaam: {last_tool}")
    return age, "\n".join(out)


def claude_sessions(cfg, args):
    """List the Claude Code sessions on this PC that were active recently, newest first (no AI involved)."""
    import glob
    hours = min(max(int(args.get("hours") or 24), 1), 168)
    root = os.path.join(os.path.expanduser("~"), ".claude", "projects")
    now = time.time()
    found = []
    for path in glob.glob(os.path.join(root, "*", "*.jsonl")):
        folder = os.path.basename(os.path.dirname(path))
        if "Temp-claude" in folder or "brain_workdir" in folder:  # Jarvis's own test/brain sessions
            continue
        if now - os.path.getmtime(path) <= hours * 3600:
            found.append(path)
    if not found:
        return f"Pichle {hours} ghante me koi Claude Code session nahi mila."
    found.sort(key=os.path.getmtime, reverse=True)
    blocks = [summarize_session(p, now)[1] for p in found[:6]]
    return f"Claude Code sessions (pichle {hours} ghante, {len(found)} mile):\n\n" + "\n\n".join(blocks)


def focus_window(title_part):
    """Bring the first visible window whose title contains `title_part` to the front (Windows). Returns its title."""
    if sys.platform != "win32":
        raise NotImplementedError("window focus abhi sirf Windows par")
    user32 = ctypes.windll.user32
    found = []
    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def visit(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                if title_part.lower() in buf.value.lower():
                    found.append((hwnd, buf.value))
        return True

    user32.EnumWindows(enum_proc(visit), 0)
    if not found:
        raise LookupError(f"'{title_part}' naam ki koi khuli window nahi mili")
    hwnd, title = found[0]
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.keybd_event(0x12, 0, 0, 0)  # a tap on Alt lets SetForegroundWindow through Windows' focus lock
    user32.keybd_event(0x12, 0, 2, 0)
    user32.SetForegroundWindow(hwnd)
    time.sleep(1.5)
    return title


TEXT_CONTROLS = {"TextControl", "EditControl", "DocumentControl", "HyperlinkControl", "ListItemControl", "TreeItemControl",
                 "ButtonControl", "TabItemControl", "MenuItemControl", "HeaderControl", "CheckBoxControl", "RadioButtonControl"}


def read_window_text(title_part, max_chars=30000, budget_seconds=25):
    """Copy the visible text of a window through Windows UI Automation (what a screen reader sees): no screenshot,
    no clipboard, nothing is clicked or typed. Returns (window title, text)."""
    import uiautomation as auto

    with auto.UIAutomationInitializerInThread():
        if title_part:
            win = auto.WindowControl(searchDepth=1, SubName=title_part)
            if not win.Exists(3, 0.5):
                raise LookupError(f"'{title_part}' naam ki koi khuli window nahi mili")
        else:
            win = auto.GetForegroundControl().GetTopLevelControl()
        title = win.Name or "(bina naam)"
        parts, seen, total = [], set(), 0
        deadline = time.time() + budget_seconds

        def walk(ctrl, depth):
            nonlocal total
            if depth > 45 or total >= max_chars or time.time() > deadline:
                return
            try:
                name = (ctrl.Name or "").strip()
                kind = ctrl.ControlTypeName
                value = ""
                if kind in ("EditControl", "DocumentControl"):
                    try:
                        value = (ctrl.GetValuePattern().Value or "").strip()
                    except Exception:
                        value = ""
                for text in (value, name):
                    if text and kind in TEXT_CONTROLS and text not in seen:
                        seen.add(text)
                        parts.append(text)
                        total += len(text) + 1
                children = ctrl.GetChildren()
            except Exception:
                return
            for child in children:
                walk(child, depth + 1)

        walk(win, 0)
    return title, "\n".join(parts)[:max_chars]


def window_read(cfg, args):
    """Copy the text of a window (or the front window) and let an AI explain it. No image is involved."""
    window = str(args.get("window") or "").strip()
    engine = str(args.get("engine") or "codex")
    if engine not in ENGINES:
        raise ValueError("unknown engine: " + engine)
    question = str(args.get("question") or "").strip() or "Is window me kya likha hai aur kya chal raha hai? Samjhakar batao."
    if window:
        focus_window(window)
    title, text = read_window_text(window)
    if len(text.strip()) < 40:
        raise RuntimeError(f"'{title}' se text nahi mil paya (app apna text screen-reader ko nahi deti). Ye app screen_look se dekho.")
    prompt = (f"Below is text copied from the window titled \"{title}\" on the user's laptop (UI text: it can include menus, "
              f"buttons and repeated labels; ignore that chrome and focus on the real content, progress and errors).\n\n"
              f"QUESTION: {question}\n\nReply in the language of the question (Hindi/Hinglish/English), plain text, brief "
              f"but complete. Say only what the text supports.\n\n----- WINDOW TEXT -----\n{text}")
    answer = run_brain(cfg, {"engine": engine, "prompt": prompt})
    return f"(window: {title}, {len(text)} akshar copy kiye)\n{answer}\n\n— text copy · {engine}"


def screen_look(cfg, args):
    """Screenshot (optionally after bringing a window to the front) read by a vision-capable AI CLI.
    The picture lives in a temp file for this call only and is never sent to the Jarvis server."""
    import secrets
    import tempfile
    from PIL import ImageGrab

    engine = str(args.get("engine") or "codex")
    if engine not in ENGINES:
        raise ValueError("unknown engine: " + engine)
    question = str(args.get("question") or "").strip() or "Is screen par kya khula hai aur kya ho raha hai? Short summary do."
    window = str(args.get("window") or "").strip()
    note = ""
    if window:
        title = focus_window(window)
        note = f"(window: {title}) "
    os.makedirs(BRAIN_DIR, exist_ok=True)
    name = f"screen_{secrets.token_hex(4)}.png"
    path = os.path.join(BRAIN_DIR, name)
    temp_out = None
    try:
        img = ImageGrab.grab(all_screens=True)
        if img.width > 1920:  # keep the upload small and fast
            img = img.resize((1920, round(img.height * 1920 / img.width)))
        img.save(path)
        prompt = (question + "\nReply in the language of the question (Hindi/Hinglish/English), brief, plain text. "
                  "Describe only what is visible on the screenshot; do not guess about anything hidden.")
        exe = cli_executable(cfg, engine)
        stdin = None
        if engine == "codex":
            fd, temp_out = tempfile.mkstemp(prefix="jarvis_screen_", suffix=".txt")
            os.close(fd)
            cmd = exe + ["exec", "-i", path, "-C", BRAIN_DIR, "-s", "read-only", "--skip-git-repo-check", "-o", temp_out, "-"]
            stdin = prompt  # `-i` is variadic, so it comes before the other flags and the prompt goes over stdin
        elif engine == "claude":
            cmd = exe + ["-p", "--output-format", "json", "--tools", "Read", "--allowedTools", "Read", "--max-turns", "4"]
            stdin = prompt + f"\nThe screenshot is the image file {name} in the current folder: read it first."
        else:
            cmd = exe + ["-p", f"Look at the image @{name} . " + prompt, "--output-format", "json", "--approval-mode", "plan"]
        proc = subprocess.Popen(cmd, cwd=BRAIN_DIR, stdin=subprocess.PIPE if stdin else subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
        try:
            out, err = proc.communicate(stdin, timeout=cfg.get("screen_timeout_seconds", 180))
        except subprocess.TimeoutExpired:
            kill_tree(proc)
            raise TimeoutError(f"{engine} ne screen padhne me bahut der ki (timeout)")
        if engine == "codex":
            with open(temp_out, encoding="utf-8", errors="replace") as f:
                text = f.read().strip()
        else:
            try:
                j = json.loads(out)
            except ValueError:
                raise RuntimeError((out.strip() or err.strip() or f"exit code {proc.returncode}")[:1500])
            if j.get("is_error") or j.get("error"):
                raise RuntimeError(str(j.get("result") or j.get("error"))[:1500])
            text = str((j.get("result") if engine == "claude" else j.get("response")) or "").strip()
        if proc.returncode != 0 or not text:
            raise RuntimeError((text or err.strip() or out.strip() or f"exit code {proc.returncode}")[:1500])
        return note + text + f"\n\n— screen · {engine}"
    finally:
        for p in (path, temp_out):
            if p and os.path.exists(p):
                os.remove(p)


def run_ai(cfg, engine, mode, args):
    """Run an AI coding CLI headless in an allow-listed project folder and return its final answer."""
    project = str(args.get("project", ""))
    path = cfg["projects"].get(project)
    if not path or not os.path.isdir(path):
        raise PermissionError("ye project config.json ke 'projects' me nahi hai: " + project)
    prompt = str(args.get("prompt", "")).strip()
    if not prompt:
        raise ValueError("prompt khali hai")
    if prompt.startswith("-"):
        prompt = "Request: " + prompt  # never let the text be parsed as a CLI flag

    state = load_state()
    state_project = state["sessions"].get(project, {})
    if not isinstance(state_project, dict):  # older state.json stored a bare claude session id
        state_project = {"claude": state_project}
    cmd, read, temp_file = build_command(cfg, engine, mode, prompt, path, bool(args.get("continue")), state_project)

    try:
        proc = subprocess.Popen(cmd, cwd=path, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace")
        try:
            out, err = proc.communicate(timeout=cfg["ai_timeout_minutes"] * 60)
        except subprocess.TimeoutExpired:
            kill_tree(proc)
            raise TimeoutError(f"{engine} {cfg['ai_timeout_minutes']} minute me khatam nahi hua, roka gaya")
        try:
            text, session = read(out, err, proc.returncode)
        except ValueError:  # output was not the JSON we expected
            raise RuntimeError((out.strip() or err.strip() or f"exit code {proc.returncode}")[:3000])
    finally:
        if temp_file and os.path.exists(temp_file):
            os.remove(temp_file)

    if session:
        state_project[engine] = session
        state["sessions"][project] = state_project
        save_state(state)
    if proc.returncode != 0:
        raise RuntimeError(text)
    return text


def run_action(cfg, action, args):
    if action not in cfg["allowed_actions"]:
        raise PermissionError(f"{action} is agent par band hai")
    if action == "brain_chat":
        return run_brain(cfg, args)
    if action == "screen_look":
        return screen_look(cfg, args)
    if action == "claude_sessions":
        return claude_sessions(cfg, args)
    if action == "window_read":
        return window_read(cfg, args)
    if action in AI_ACTIONS:
        engine, mode = action.split("_")
        return run_ai(cfg, engine, mode, args)
    if action == "cpu_status":
        return cpu_status()
    if action == "speak":
        return speak(str(args.get("text", ""))[:300])
    if action == "open_url":
        return open_url(str(args.get("url", "")))
    if action == "open_app":
        path = cfg["apps"].get(str(args.get("app", "")))
        if not path:
            raise PermissionError("ye app config.json ke 'apps' me nahi hai: " + str(args.get("app")))
        subprocess.Popen([path])  # list form, no shell
        return "chalu kiya"
    if sys.platform != "win32":
        raise NotImplementedError("lock/shutdown/restart abhi sirf Windows par")
    if action == "lock":
        ctypes.windll.user32.LockWorkStation()
        return "locked"
    if action in ("shutdown", "restart"):
        flag = "/s" if action == "shutdown" else "/r"
        # 60 second grace so you can cancel with the cancel_shutdown action or `shutdown /a`
        subprocess.run(["shutdown", flag, "/t", "60", "/c", "Jarvis ne approved command chalayi"], check=True)
        return f"{action} 60 second me hoga (cancel: cancel_shutdown)"
    if action == "cancel_shutdown":
        subprocess.run(["shutdown", "/a"], check=True)
        return "cancel kar diya"
    raise ValueError("unknown action")


def main():
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="replace")  # a console that cannot show a character must not crash result reporting
    cfg = load_config()
    s = requests.Session()
    s.headers.update({"X-Agent-Token": cfg["token"], "X-Requested-With": "jarvis"})
    base = cfg["server_url"] + "api.php?r="
    print("Jarvis agent chalu:", cfg["server_url"])

    ai_queue = queue.Queue(maxsize=5)  # AI tasks run one after another; the poll loop (and the online dot) never blocks

    def execute(cmd):
        try:
            result, ok = run_action(cfg, cmd["action"], cmd.get("args") or {}), True
        except Exception as e:  # report every failure back to the server
            result, ok = f"{type(e).__name__}: {e}", False
        print(("OK  " if ok else "FAIL"), cmd["action"], str(result)[:200], flush=True)
        for _ in range(3):
            try:
                s.post(base + "agent_result", json={"id": cmd["id"], "ok": ok, "result": result}, timeout=30)
                break
            except requests.RequestException:
                time.sleep(5)

    brain_queue = queue.Queue(maxsize=3)  # chat turns get their own lane so a long coding task never blocks them

    def make_worker(q):
        def worker():
            while True:
                execute(q.get())
        return worker

    threading.Thread(target=make_worker(ai_queue), daemon=True).start()
    threading.Thread(target=make_worker(brain_queue), daemon=True).start()

    while True:
        try:
            params = {"cpu": psutil.cpu_percent(interval=None), "ram": psutil.virtual_memory().percent,
                      "projects": ",".join(cfg["projects"].keys())}
            battery = psutil.sensors_battery()
            if battery:
                params["bat"] = battery.percent
            r = s.get(base + "agent_poll", params=params, timeout=15)
            if r.status_code == 401:
                sys.exit("Server ne token reject kiya (block ya delete hua?). Agent band.")
            r.raise_for_status()
            for cmd in r.json().get("commands", []):
                if cmd["action"] in AI_ACTIONS or cmd["action"] in ("brain_chat", "screen_look", "window_read", "claude_sessions"):
                    try:
                        (brain_queue if cmd["action"] == "brain_chat" else ai_queue).put_nowait(cmd)
                    except queue.Full:
                        s.post(base + "agent_result", json={"id": cmd["id"], "ok": False,
                               "result": "Queue bhari hai (5 AI task intezaar me), thodi der baad dobara bhejo"}, timeout=15)
                else:
                    execute(cmd)
        except requests.RequestException as e:
            print("network issue:", e, flush=True)
            time.sleep(10)
        time.sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()

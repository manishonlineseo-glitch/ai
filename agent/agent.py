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
ALL_ACTIONS = {"cpu_status", "speak", "open_url", "open_app", "lock", "shutdown", "restart", "cancel_shutdown"} | AI_ACTIONS
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

    def ai_worker():
        while True:
            execute(ai_queue.get())

    threading.Thread(target=ai_worker, daemon=True).start()

    while True:
        try:
            params = {"cpu": psutil.cpu_percent(interval=None), "ram": psutil.virtual_memory().percent}
            battery = psutil.sensors_battery()
            if battery:
                params["bat"] = battery.percent
            r = s.get(base + "agent_poll", params=params, timeout=15)
            if r.status_code == 401:
                sys.exit("Server ne token reject kiya (block ya delete hua?). Agent band.")
            r.raise_for_status()
            for cmd in r.json().get("commands", []):
                if cmd["action"] in AI_ACTIONS:
                    try:
                        ai_queue.put_nowait(cmd)
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

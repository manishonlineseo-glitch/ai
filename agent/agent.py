"""Jarvis PC agent.

Runs on a laptop/desktop you own. It only makes OUTBOUND HTTPS calls to your
Jarvis server (no open ports), asks "anything for me?" every few seconds and
runs a small fixed set of actions. Anything not on the list is refused here
even if the server asks for it.
"""
import ctypes
import json
import os
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

ALL_ACTIONS = {"cpu_status", "speak", "open_url", "open_app", "lock", "shutdown", "restart", "cancel_shutdown",
               "claude_read", "claude_work"}
STATE_PATH = os.path.join(HERE, "state.json")

# Claude Code (headless) profiles. Override any key under "claude" in config.json.
CLAUDE_DEFAULTS = {
    "command": "claude",  # or a list with the full path, e.g. ["C:\\Users\\you\\.local\\bin\\claude.exe"]
    "timeout_minutes": 30,
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
    cfg.setdefault("projects", {})  # {"jarvis": "C:\\xampp\\htdocs\\ai"}: the only folders Claude Code may work in
    claude = {**CLAUDE_DEFAULTS, **cfg.get("claude", {})}
    for mode in ("read", "work"):
        claude[mode] = {**CLAUDE_DEFAULTS[mode], **claude.get(mode, {})}
    cfg["claude"] = claude
    # claude_work (can edit files) stays off unless you list it in allowed_actions yourself.
    cfg["allowed_actions"] = set(cfg.get("allowed_actions", ALL_ACTIONS - {"claude_work"})) & ALL_ACTIONS
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


def claude_executable(cfg):
    command = cfg["claude"]["command"]
    if isinstance(command, list):
        return list(command)
    path = shutil.which(command)
    if not path:
        raise FileNotFoundError("Claude Code CLI nahi mila. Install karo (claude.ai/install) aur 'claude auth login' chalao, "
                                "ya config.json me claude.command me poora path do.")
    if path.lower().endswith((".cmd", ".bat")):
        # A .cmd shim would pass the prompt through cmd.exe, where & | > in the text become commands.
        raise PermissionError("claude.cmd (npm) support nahi hai; native claude.exe install karo (claude.ai/install).")
    return [path]


def kill_tree(proc):
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.kill()


def run_claude(cfg, mode, args):
    """Run Claude Code headless in an allow-listed project folder and return its final answer."""
    project = str(args.get("project", ""))
    path = cfg["projects"].get(project)
    if not path or not os.path.isdir(path):
        raise PermissionError("ye project config.json ke 'projects' me nahi hai: " + project)
    prompt = str(args.get("prompt", "")).strip()
    if not prompt:
        raise ValueError("prompt khali hai")
    if prompt.startswith("-"):
        prompt = "Request: " + prompt  # never let the text be parsed as a CLI flag
    spec = cfg["claude"][mode]
    state = load_state()
    cmd = claude_executable(cfg) + [
        "-p", prompt, "--output-format", "json",
        "--permission-mode", spec["permission_mode"],
        "--tools", spec["tools"],
        "--max-turns", str(cfg["claude"]["max_turns"]),
        "--max-budget-usd", str(cfg["claude"]["max_budget_usd"]),
    ]
    session = state["sessions"].get(project)
    if args.get("continue") and session:
        cmd += ["--resume", session]
    cmd += ["--allowedTools", *spec["allowed"]]  # variadic flag goes last so it can't swallow the prompt

    proc = subprocess.Popen(cmd, cwd=path, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, encoding="utf-8", errors="replace")
    try:
        out, err = proc.communicate(timeout=cfg["claude"]["timeout_minutes"] * 60)
    except subprocess.TimeoutExpired:
        kill_tree(proc)
        raise TimeoutError(f"Claude Code {cfg['claude']['timeout_minutes']} minute me khatam nahi hua, roka gaya")
    try:
        j = json.loads(out)
    except ValueError:
        raise RuntimeError((out.strip() or err.strip() or f"exit code {proc.returncode}")[:3000])
    if j.get("session_id"):
        state["sessions"][project] = j["session_id"]
        save_state(state)
    footer = "\n\n\u2014 {} \u00b7 session {} \u00b7 ${:.2f}".format(
        project, str(j.get("session_id", "?"))[:8], float(j.get("total_cost_usd") or 0))
    text = str(j.get("result") or "(khali jawab)") + footer
    if j.get("is_error") or proc.returncode != 0:
        raise RuntimeError(text)
    return text


def run_action(cfg, action, args):
    if action not in cfg["allowed_actions"]:
        raise PermissionError(f"{action} is agent par band hai")
    if action in ("claude_read", "claude_work"):
        return run_claude(cfg, action.split("_")[1], args)
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

    claude_busy = threading.Event()

    def execute(cmd):
        try:
            result, ok = run_action(cfg, cmd["action"], cmd.get("args") or {}), True
        except Exception as e:  # report every failure back to the server
            result, ok = f"{type(e).__name__}: {e}", False
        finally:
            if cmd["action"].startswith("claude_"):
                claude_busy.clear()
        print(("OK  " if ok else "FAIL"), cmd["action"], str(result)[:200], flush=True)
        for _ in range(3):
            try:
                s.post(base + "agent_result", json={"id": cmd["id"], "ok": ok, "result": result}, timeout=30)
                break
            except requests.RequestException:
                time.sleep(5)

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
                if cmd["action"].startswith("claude_"):
                    # Runs in a thread so polling (and the online dot) keeps going during long tasks.
                    if claude_busy.is_set():
                        s.post(base + "agent_result", json={"id": cmd["id"], "ok": False,
                               "result": "Ek Claude task pehle se chal raha hai, khatam hone ke baad dobara bhejo"}, timeout=15)
                        continue
                    claude_busy.set()
                    threading.Thread(target=execute, args=(cmd,), daemon=True).start()
                else:
                    execute(cmd)
        except requests.RequestException as e:
            print("network issue:", e, flush=True)
            time.sleep(10)
        time.sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()

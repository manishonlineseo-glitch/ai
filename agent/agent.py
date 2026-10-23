"""Jarvis PC agent.

Runs on a laptop/desktop you own. It only makes OUTBOUND HTTPS calls to your
Jarvis server (no open ports), asks "anything for me?" every few seconds and
runs a small fixed set of actions. Anything not on the list is refused here
even if the server asks for it.
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import webbrowser
from urllib.parse import urlparse

import psutil
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")

ALL_ACTIONS = {"cpu_status", "speak", "open_url", "open_app", "lock", "shutdown", "restart", "cancel_shutdown"}


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
    cfg["allowed_actions"] = set(cfg.get("allowed_actions", ALL_ACTIONS)) & ALL_ACTIONS
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


def run_action(cfg, action, args):
    if action not in cfg["allowed_actions"]:
        raise PermissionError(f"{action} is agent par band hai")
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
    cfg = load_config()
    s = requests.Session()
    s.headers.update({"X-Agent-Token": cfg["token"], "X-Requested-With": "jarvis"})
    base = cfg["server_url"] + "api.php?r="
    print("Jarvis agent chalu:", cfg["server_url"])

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
                try:
                    result, ok = run_action(cfg, cmd["action"], cmd.get("args") or {}), True
                except Exception as e:  # report every failure back to the server
                    result, ok = f"{type(e).__name__}: {e}", False
                print(("OK  " if ok else "FAIL"), cmd["action"], result)
                s.post(base + "agent_result", json={"id": cmd["id"], "ok": ok, "result": result}, timeout=15)
        except requests.RequestException as e:
            print("network issue:", e)
            time.sleep(10)
        time.sleep(cfg["poll_seconds"])


if __name__ == "__main__":
    main()

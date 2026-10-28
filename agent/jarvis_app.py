"""Jarvis for Windows: a tray app that runs the PC agent.

First start: asks for the Device username and password made in the Jarvis site (Devices tab) and signs in by itself, no files to edit.
Afterwards it lives in the system tray (green = connected), can start with Windows, and has a small Settings window
for the project folders the AI tools may work in. Files are kept in %APPDATA%\\JarvisAgent.
Run `JarvisAgent.exe --setup` or `--settings` to open those windows directly.
"""
import ctypes
import json
import os
import sys
import threading
import webbrowser

APPDATA = os.environ.get("APPDATA") or os.path.expanduser("~")
HOME = os.environ.get("JARVIS_AGENT_HOME") or os.path.join(APPDATA, "JarvisAgent")
os.makedirs(HOME, exist_ok=True)
os.environ["JARVIS_AGENT_HOME"] = HOME  # must be set before agent.py is imported

DEFAULT_SERVER = "https://ai.udaypurgroup.in/"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "JarvisAgent"

import requests  # noqa: E402

import agent  # noqa: E402  (agent.py sits next to this file)

CONFIG = agent.CONFIG_PATH


# ----------------------------------------------------------------------------- config helpers
def read_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_config(cfg):
    tmp = CONFIG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, CONFIG)


def default_config(server_url, token):
    return {
        "server_url": server_url,
        "token": token,
        "poll_seconds": 1,
        "apps": {"notepad": r"C:\Windows\notepad.exe", "calculator": r"C:\Windows\System32\calc.exe"},
        "projects": {},
        # everything is allowed on this PC; the server still asks you to tap Approve for file edits, shutdown, unknown links
        "allowed_actions": sorted(agent.ALL_ACTIONS),
    }


# ----------------------------------------------------------------------------- autostart (current user only, no admin)
def autostart_enabled():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.QueryValueEx(k, RUN_NAME)
            return True
    except OSError:
        return False


def set_autostart(on):
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            exe = sys.executable if getattr(sys, "frozen", False) else f'"{sys.executable}" "{os.path.abspath(__file__)}"'
            winreg.SetValueEx(k, RUN_NAME, 0, winreg.REG_SZ, f'"{exe}"' if getattr(sys, "frozen", False) else exe)
        else:
            try:
                winreg.DeleteValue(k, RUN_NAME)
            except OSError:
                pass


# ----------------------------------------------------------------------------- windows (run as their own process)
def setup_window():
    import tkinter as tk
    from tkinter import messagebox

    old = read_config() or {}
    root = tk.Tk()
    root.title("Jarvis login")
    root.resizable(False, False)
    pad = {"padx": 14, "pady": 6}
    tk.Label(root, text="Is PC ko Jarvis se jodo", font=("Segoe UI", 13, "bold")).pack(**pad)
    tk.Label(root, text="Jarvis site > Devices me is PC ka Username aur Password banaya hai wahi daalo.\n(Naya device ID wahin '+ Naya device ID' se banta hai.)",
             justify="left").pack(**pad)
    tk.Label(root, text="Server").pack(anchor="w", padx=14)
    server = tk.Entry(root, width=44)
    server.insert(0, old.get("server_url", DEFAULT_SERVER))
    server.pack(padx=14)
    tk.Label(root, text="Username").pack(anchor="w", padx=14, pady=(8, 0))
    user = tk.Entry(root, width=30, font=("Segoe UI", 12))
    user.insert(0, (old.get("login") or {}).get("username", ""))
    user.pack(padx=14)
    tk.Label(root, text="Password").pack(anchor="w", padx=14, pady=(8, 0))
    pw = tk.Entry(root, width=30, font=("Segoe UI", 12), show="*")
    pw.pack(padx=14)
    (pw if user.get() else user).focus_set()
    status = tk.Label(root, text="", fg="#b3261e", wraplength=360, justify="left")
    status.pack(**pad)

    def login():
        url = server.get().strip().rstrip("/") + "/"
        if not url.startswith("https://") and "localhost" not in url and "127.0.0.1" not in url:
            status.config(text="Server https:// se shuru hona chahiye.")
            return
        status.config(text="Login ho raha hai...", fg="#444")
        root.update()
        try:
            r = requests.post(url + "api.php?r=agent_login", json={"username": user.get().strip(), "password": pw.get()}, timeout=30,
                              headers={"X-Requested-With": "jarvis", "User-Agent": "JarvisAgent/1.0"})
            data = r.json()
        except (requests.RequestException, ValueError) as e:
            status.config(text=f"Server se baat nahi ho payi: {e}", fg="#b3261e")
            return
        if r.status_code != 200 or "token" not in data:
            status.config(text=data.get("error", f"Error {r.status_code}"), fg="#b3261e")
            return
        cfg = default_config(url, data["token"])
        cfg["projects"] = old.get("projects", {})  # keep folders already chosen
        cfg["login"] = {"username": user.get().strip(), "password": agent.protect_password(pw.get())}
        for k in ("apps", "codex", "gemini", "claude"):  # keep the owner's own settings
            if k in old:
                cfg[k] = old[k]
        write_config(cfg)
        messagebox.showinfo("Jarvis", f"Jud gaya: {data.get('name', 'PC')}.\nAb ye PC Jarvis se control ho sakta hai.")
        root.destroy()

    tk.Button(root, text="Login", width=14, command=login).pack(pady=(0, 14))
    root.bind("<Return>", lambda e: login())
    root.mainloop()


def settings_window():
    import tkinter as tk
    from tkinter import filedialog, messagebox

    cfg = read_config()
    if not cfg:
        return setup_window()
    root = tk.Tk()
    root.title("Jarvis settings")
    pad = {"padx": 14, "pady": 6}
    tk.Label(root, text="Folders jahan AI tools kaam kar sakte hain", font=("Segoe UI", 12, "bold")).pack(**pad)
    tk.Label(root, text="Sirf yahi folders Codex/Claude/Gemini ko diye jaate hain.\nAap Jarvis se bolte ho: \"<naam> project me ...\".", justify="left").pack(padx=14)
    box = tk.Listbox(root, width=64, height=8)
    box.pack(padx=14, pady=6)
    projects = dict(cfg.get("projects", {}))

    def refresh():
        box.delete(0, "end")
        for name, path in projects.items():
            box.insert("end", f"{name}  ->  {path}")

    def add():
        folder = filedialog.askdirectory(title="Project folder chuno")
        if folder:
            base = "".join(c for c in os.path.basename(folder.rstrip("/\\")) if c.isalnum() or c in " _.-")[:40] or "project"
            name, n = base, 2
            while name in projects:
                name, n = f"{base}{n}", n + 1
            projects[name] = os.path.normpath(folder)
            refresh()

    def remove():
        sel = box.curselection()
        if sel:
            projects.pop(list(projects)[sel[0]], None)
            refresh()

    row = tk.Frame(root)
    row.pack()
    tk.Button(row, text="Folder jodo", command=add).pack(side="left", padx=4)
    tk.Button(row, text="Hatao", command=remove).pack(side="left", padx=4)
    refresh()

    auto = tk.BooleanVar(value=autostart_enabled())
    tk.Checkbutton(root, text="Windows chalu hote hi apne aap start ho", variable=auto).pack(anchor="w", padx=14, pady=(10, 0))
    tk.Button(root, text="Dobara login karo (naya username/password)", command=lambda: (root.destroy(), setup_window())).pack(anchor="w", padx=14, pady=4)

    def save():
        cfg["projects"] = projects
        write_config(cfg)
        try:
            set_autostart(auto.get())
        except OSError as e:
            messagebox.showwarning("Jarvis", f"Autostart set nahi ho paya: {e}")
        root.destroy()

    tk.Button(root, text="Save", width=14, command=save).pack(pady=12)
    root.mainloop()


# ----------------------------------------------------------------------------- tray
def make_icon(color):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 60, 60), fill=(11, 16, 32, 255), outline=color, width=5)
    d.ellipse((22, 22, 42, 42), fill=color)
    return img


STATE_COLOR = {"online": (60, 200, 110, 255), "offline": (150, 150, 150, 255),
               "blocked": (240, 170, 40, 255), "rejected": (230, 70, 60, 255), "starting": (150, 150, 150, 255)}
STATE_TEXT = {"online": "Jude hue hain", "offline": "Internet/server nahi mil raha", "blocked": "Server ne roka, ruk kar dobara koshish",
              "rejected": "Login nahi ho paya: Settings > dobara login karo", "starting": "Shuru ho raha hai..."}


def run_tray():
    import pystray

    state = {"value": "starting"}
    stop_holder = {"stop": None, "thread": None}
    icon = pystray.Icon("jarvis", make_icon(STATE_COLOR["starting"]), "Jarvis")

    def on_status(value):
        if value != state["value"]:
            state["value"] = value
            icon.icon = make_icon(STATE_COLOR.get(value, STATE_COLOR["offline"]))
            icon.title = "Jarvis: " + STATE_TEXT.get(value, value)
            icon.update_menu()

    def start_agent():
        cfg = read_config()
        if not cfg:
            return False
        try:
            full = agent.load_config()
        except SystemExit as e:  # bad config: tell the tray, do not crash
            on_status("rejected")
            print("config problem:", e, flush=True)
            return False
        stop = threading.Event()
        t = threading.Thread(target=agent.run, args=(full, stop, on_status), daemon=True)
        stop_holder.update(stop=stop, thread=t)
        t.start()
        return True

    def stop_agent():
        if stop_holder["stop"]:
            stop_holder["stop"].set()
            stop_holder["thread"].join(timeout=3)
        stop_holder.update(stop=None, thread=None)

    def child(flag):
        """Open a settings/setup window as its own process, then restart the agent with the new settings."""
        def go():
            import subprocess
            exe = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, os.path.abspath(__file__)]
            subprocess.run(exe + [flag])
            stop_agent()
            on_status("starting")
            start_agent()
        threading.Thread(target=go, daemon=True).start()

    def open_site(_icon=None, _item=None):
        cfg = read_config() or {}
        webbrowser.open(cfg.get("server_url", DEFAULT_SERVER))

    def toggle_autostart(_icon, _item):
        try:
            set_autostart(not autostart_enabled())
        except OSError:
            pass

    def quit_app(_icon, _item):
        stop_agent()
        icon.stop()

    icon.menu = pystray.Menu(
        pystray.MenuItem(lambda item: "Jarvis: " + STATE_TEXT.get(state["value"], state["value"]), None, enabled=False),
        pystray.MenuItem("Jarvis site kholo", open_site, default=True),
        pystray.MenuItem("Settings (folders)", lambda *_: child("--settings")),
        pystray.MenuItem("Windows ke saath start", toggle_autostart, checked=lambda item: autostart_enabled()),
        pystray.MenuItem("Band karo", quit_app),
    )
    if not start_agent():
        child("--setup")  # first run: ask for the pairing code, then start
    icon.run()


def selftest():
    """Diagnostic: can this build read a window's text (Windows UI Automation)? Opens its own small message box and closes only that."""
    import time
    title = "JarvisSelfTest"
    threading.Thread(target=lambda: ctypes.windll.user32.MessageBoxW(0, "UIA OK 4821", title, 0), daemon=True).start()
    time.sleep(1.5)
    ok = False
    try:
        _, text = agent.read_window_text(title, budget_seconds=10)
        ok = "4821" in text
        print("SELFTEST text read:", repr(text[:80]), flush=True)
    except Exception as e:  # report, do not crash
        print("SELFTEST error:", type(e).__name__, e, flush=True)
    finally:
        hwnd = ctypes.windll.user32.FindWindowW(None, title)
        if hwnd:
            ctypes.windll.user32.PostMessageW(hwnd, 0x10, 0, 0)  # WM_CLOSE to that one window only
    print("SELFTEST", "OK" if ok else "FAILED", flush=True)
    sys.exit(0 if ok else 1)


def single_instance():
    """True if this is the only running copy (a named mutex)."""
    handle = ctypes.windll.kernel32.CreateMutexW(None, False, "JarvisAgentSingleInstance")
    return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS


def main():
    log_path = os.path.join(HOME, "agent.log")
    try:
        if os.path.exists(log_path) and os.path.getsize(log_path) > 1_000_000:
            os.remove(log_path)
        sys.stdout = sys.stderr = open(log_path, "a", buffering=1, encoding="utf-8", errors="replace")
    except OSError:
        pass
    if "--selftest" in sys.argv:
        return selftest()
    if "--setup" in sys.argv:
        return setup_window()
    if "--settings" in sys.argv:
        return settings_window()
    if "--vault" in sys.argv:
        import ops
        return ops.vault_window(sys.argv[sys.argv.index("--vault") + 1])
    if not single_instance():
        return
    run_tray()


if __name__ == "__main__":
    main()

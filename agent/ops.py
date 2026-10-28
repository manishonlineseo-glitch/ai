"""Hands for Jarvis on this laptop: Chrome profiles, keyboard/mouse control of any window (like a person), a password vault that only
lives here (Windows DPAPI), the "operate" loop (look at the screen, decide the next step, do it, repeat) and self-update.

Everything here runs only for commands the Jarvis server sends to this paired agent. Passwords never leave this PC.
"""
import ctypes
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from ctypes import wintypes

VERSION = "1.2.4"

HOME = os.environ.get("JARVIS_AGENT_HOME") or os.path.dirname(os.path.abspath(__file__))
VAULT_PATH = os.path.join(HOME, "vault.bin")

# A window with one of these words in its title is never typed into or clicked: the owner does money and password screens himself.
SENSITIVE = re.compile(
    r"net ?banking|bank|upi|paytm|phonepe|google pay|gpay|bhim|credit card|debit card|payment|checkout|wallet|"
    r"password|passwords|1password|bitwarden|lastpass|keepass|dashlane|hdfc|icici|\bsbi\b|axis|kotak|yes bank|razorpay",
    re.I,
)
BAD_KEYS = re.compile(r"(^|\+)(win|windows|cmd|meta)(\+|$)|alt\+f4|ctrl\+alt\+del|ctrl\+shift\+esc", re.I)

# set by agent.execute() for the command that is running now: (requests.Session, api base url, command id)
CTX = {"session": None, "base": None, "cmd": None}


# ------------------------------------------------------------------ Chrome profiles
def chrome_user_data():
    return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")


def chrome_profiles(_args=None):
    """[{dir, name, email, gaia}] from Chrome's own Local State file (names and emails only, no cookies or passwords)."""
    with open(os.path.join(chrome_user_data(), "Local State"), encoding="utf-8") as f:
        info = json.load(f)["profile"]["info_cache"]
    out = [{"dir": k, "name": v.get("name", ""), "email": v.get("user_name", ""), "gaia": v.get("gaia_name", "")} for k, v in info.items()]
    return json.dumps(out, ensure_ascii=False)


def find_chrome():
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), os.environ.get("LOCALAPPDATA")):
        if base:
            p = os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")
            if os.path.exists(p):
                return p
    raise FileNotFoundError("chrome.exe nahi mila")


def open_chrome(query=""):
    """Open Chrome straight into a profile (matched by name, email or folder) so the "Who's using Chrome?" picker never shows.
    No query: the profile used last."""
    with open(os.path.join(chrome_user_data(), "Local State"), encoding="utf-8") as f:
        prof = json.load(f)["profile"]
    info = prof.get("info_cache", {})
    q = (query or "").strip().lower()
    pick = None
    if q:
        def fields(k, v):
            return [k.lower(), str(v.get("name", "")).lower(), str(v.get("user_name", "")).lower(), str(v.get("gaia_name", "")).lower()]
        pick = next((k for k, v in info.items() if q in fields(k, v)), None) or             next((k for k, v in info.items() if any(q in x for x in fields(k, v))), None)
        if not pick:
            raise LookupError(f"Chrome me '{query}' naam ka profile nahi mila. Profiles: " + ", ".join(v.get("name", k) for k, v in info.items()))
    else:
        pick = prof.get("last_used") or ("Default" if "Default" in info else next(iter(info), None))
    args = [find_chrome()] + ([f"--profile-directory={pick}"] if pick else [])
    subprocess.Popen(args)  # list form, no shell
    return f"Chrome khul gaya ({info.get(pick, {}).get('name', pick)})"


def open_url_profile(url, profile):
    known = {p["dir"] for p in json.loads(chrome_profiles())}
    if profile not in known:
        raise LookupError(f"Chrome profile '{profile}' nahi mila")
    subprocess.Popen([find_chrome(), f"--profile-directory={profile}", url])  # list form, no shell
    return f"khul gaya ({profile})"


# ------------------------------------------------------------------ keyboard / mouse like a person
KEYNAMES = {"enter": "{Enter}", "tab": "{Tab}", "esc": "{Esc}", "escape": "{Esc}", "backspace": "{Backspace}", "delete": "{Delete}", "up": "{Up}",
            "down": "{Down}", "left": "{Left}", "right": "{Right}", "home": "{Home}", "end": "{End}", "pageup": "{PageUp}", "pagedown": "{PageDown}",
            "space": "{Space}", "ctrl": "{Ctrl}", "shift": "{Shift}", "alt": "{Alt}"}


def keys_to_sendkeys(combo):
    """'ctrl+shift+t' -> '{Ctrl}{Shift}t'"""
    if BAD_KEYS.search(combo):
        raise PermissionError(f"ye key ({combo}) Jarvis nahi dabata")
    parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
    out = ""
    for p in parts:
        if p in KEYNAMES:
            out += KEYNAMES[p]
        elif re.fullmatch(r"f([1-9]|1[0-2])", p):
            out += "{" + p.upper() + "}"
        elif len(p) == 1:
            out += p
        else:
            raise ValueError(f"unknown key: {p}")
    return out


def foreground_title():
    import uiautomation as auto
    return (auto.GetForegroundControl().GetTopLevelControl().Name or "").strip()


def guard():
    """Refuse to touch money / password windows."""
    title = foreground_title()
    if SENSITIVE.search(title):
        raise PermissionError(f"'{title}' bank/password jaisi window hai: ye aap khud karo, Jarvis isme type/click nahi karega")
    return title


# ------------------------------------------------------------------ "see what Jarvis is doing": banner, click ring and a visible mouse glide
_OVQ = {"q": None}


def _clickthrough(win):
    """Make a Tk window ignore the mouse and never take focus, so it cannot get in the way of what Jarvis is clicking."""
    try:
        hwnd = ctypes.windll.user32.GetParent(win.winfo_id()) or win.winfo_id()
        GWL_EXSTYLE, flags = -20, 0x80000 | 0x20 | 0x8000000 | 0x80  # LAYERED | TRANSPARENT | NOACTIVATE | TOOLWINDOW
        old = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, old | flags)
    except Exception:
        pass


def _overlay_loop(q):
    import queue as _q
    import tkinter as tk
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # same pixel units as the mouse and UI Automation
    except Exception:
        pass
    root = tk.Tk()
    root.withdraw()
    state = {"banner": None, "label": None, "hide": 0.0}

    def banner(text):
        if state["banner"] is None:
            w = tk.Toplevel(root)
            w.overrideredirect(True)
            w.attributes("-topmost", True)
            w.attributes("-alpha", 0.92)
            w.configure(bg="#0b1020")
            lab = tk.Label(w, text="", bg="#0b1020", fg="#7cffb2", font=("Segoe UI", 14, "bold"), padx=20, pady=8)
            lab.pack()
            state["banner"], state["label"] = w, lab
            _clickthrough(w)
        state["label"].config(text="● Jarvis kaam kar raha hai: " + text)
        w = state["banner"]
        w.update_idletasks()
        w.geometry(f"+{max((w.winfo_screenwidth() - w.winfo_width()) // 2, 0)}+10")
        w.deiconify()
        state["hide"] = time.time() + 6

    def ring(x, y):
        r = tk.Toplevel(root)
        r.overrideredirect(True)
        r.attributes("-topmost", True)
        r.configure(bg="#010101")
        r.attributes("-transparentcolor", "#010101")
        r.geometry(f"72x72+{x - 36}+{y - 36}")
        c = tk.Canvas(r, width=72, height=72, bg="#010101", highlightthickness=0)
        c.pack()
        c.create_oval(6, 6, 66, 66, outline="#ff3b30", width=5)
        c.create_oval(30, 30, 42, 42, fill="#ff3b30", outline="")
        _clickthrough(r)
        r.after(900, r.destroy)

    def pump():
        try:
            while True:
                kind, a = q.get_nowait()
                try:
                    if kind == "banner":
                        banner(*a)
                    elif kind == "ring":
                        ring(*a)
                    elif kind == "hide" and state["banner"] is not None:
                        state["banner"].withdraw()
                except Exception:
                    pass
        except _q.Empty:
            pass
        if state["banner"] is not None and state["hide"] and time.time() > state["hide"]:
            state["banner"].withdraw()
            state["hide"] = 0.0
        root.after(40, pump)

    root.after(40, pump)
    root.mainloop()


def overlay(kind, *args):
    """Show something on the laptop screen (never raises): overlay("banner", text), overlay("ring", x, y), overlay("hide")."""
    try:
        if _OVQ["q"] is None:
            import queue as _q
            _OVQ["q"] = _q.Queue()
            threading.Thread(target=_overlay_loop, args=(_OVQ["q"],), daemon=True).start()
        _OVQ["q"].put((kind, args))
    except Exception:
        pass


def glide(x, y, seconds=0.45):
    """Move the real mouse pointer to (x, y) smoothly so the owner can follow it, then flash a ring there."""
    try:
        pt = wintypes.POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        x0, y0 = pt.x, pt.y
        steps = max(int(seconds * 60), 8)
        for i in range(1, steps + 1):
            t = i / steps
            t = t * t * (3 - 2 * t)  # ease in and out
            ctypes.windll.user32.SetCursorPos(int(x0 + (x - x0) * t), int(y0 + (y - y0) * t))
            time.sleep(seconds / steps)
        overlay("ring", int(x), int(y))
        time.sleep(0.25)
    except Exception:
        pass


def describe_step(step):
    kind = str(step.get("op", ""))
    if kind == "focus":
        return "window aage la raha hoon: " + str(step.get("window", ""))[:40]
    if kind == "click":
        return "click: " + (str(step.get("name", "")) or f"({step.get('x')},{step.get('y')})")[:40]
    if kind == "type":
        return f"type kar raha hoon ({len(str(step.get('text', '')))} akshar)"
    if kind == "key":
        return "key dabata hoon: " + str(step.get("keys", ""))[:30]
    if kind == "read":
        return "window padh raha hoon"
    return kind



def run_ops(ops):
    """Execute a list of steps like a person would. Each step: {op: focus|click|type|key|wait|read, ...}. Returns a short log."""
    import uiautomation as auto
    import agent

    log = []
    for i, step in enumerate(ops[:25], 1):
        kind = str(step.get("op", ""))
        overlay("banner", f"{i}/{min(len(ops), 25)} " + describe_step(step))
        post_progress(f"{i}. {describe_step(step)}")
        if kind == "focus":
            title = agent.focus_window(str(step.get("window", "")))
            time.sleep(0.6)
            log.append(f"{i}. window aage laayi: {title}")
        elif kind == "click":
            title = guard()
            with auto.UIAutomationInitializerInThread():
                if "x" in step and "y" in step:
                    glide(int(step["x"]), int(step["y"]))
                    auto.Click(int(step["x"]), int(step["y"]))
                    log.append(f"{i}. click ({step['x']},{step['y']})")
                else:
                    name = str(step.get("name", ""))
                    win = auto.GetForegroundControl().GetTopLevelControl()
                    ctrl = win.Control(searchDepth=12, SubName=name)
                    if not ctrl.Exists(4, 0.4):
                        raise LookupError(f"'{name}' naam ka button/item window me nahi mila")
                    try:
                        rc = ctrl.BoundingRectangle
                        glide((rc.left + rc.right) // 2, (rc.top + rc.bottom) // 2)
                        auto.Click((rc.left + rc.right) // 2, (rc.top + rc.bottom) // 2)
                    except Exception:
                        ctrl.Click()
                    log.append(f"{i}. click: {name}")
            time.sleep(0.5)
        elif kind == "type":
            guard()
            text = str(step.get("text", ""))[:3000]
            with auto.UIAutomationInitializerInThread():
                auto.SetClipboardText(text)  # paste, so any language/character works
                auto.SendKeys("{Ctrl}v", waitTime=0.2)
            if step.get("enter"):
                with auto.UIAutomationInitializerInThread():
                    auto.SendKeys("{Enter}", waitTime=0.2)
            log.append(f"{i}. type ({len(text)} akshar){' + Enter' if step.get('enter') else ''}")
            time.sleep(0.4)
        elif kind == "key":
            guard()
            combo = str(step.get("keys", ""))
            with auto.UIAutomationInitializerInThread():
                auto.SendKeys(keys_to_sendkeys(combo), waitTime=0.2)
            log.append(f"{i}. key: {combo}")
            time.sleep(0.3)
        elif kind == "wait":
            time.sleep(min(float(step.get("seconds", 1)), 30))
            log.append(f"{i}. wait")
        elif kind == "read":
            title, text = agent.read_window_text(str(step.get("window", "")), max_chars=int(step.get("max_chars", 6000)), budget_seconds=12)
            log.append(f"{i}. padha '{title}': " + text[:int(step.get("max_chars", 6000))])
        else:
            raise ValueError(f"unknown op: {kind}")
    return "\n".join(log)


def ui_control(args):
    ops = args.get("ops")
    if not isinstance(ops, list) or not ops:
        raise ValueError("ops (steps ki list) chahiye")
    return run_ops(ops)


# ------------------------------------------------------------------ password vault (Windows DPAPI: only this Windows user on this PC can open it)
class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data):
    return _Blob(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)), ctypes.POINTER(ctypes.c_char)))


def _dpapi(data, protect):
    out = _Blob()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(_blob(data)), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("DPAPI fail")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def vault_load():
    try:
        with open(VAULT_PATH, "rb") as f:
            return json.loads(_dpapi(f.read(), False).decode("utf-8"))
    except (OSError, ValueError):
        return {}


def vault_save(data):
    tmp = VAULT_PATH + ".tmp"
    with open(tmp, "wb") as f:
        f.write(_dpapi(json.dumps(data, ensure_ascii=False).encode("utf-8"), True))
    os.replace(tmp, VAULT_PATH)


def vault_sites(_args=None):
    return ", ".join(sorted(vault_load().keys())) or "(vault khali hai)"


def vault_ask(args):
    """Opens a small window ON THE LAPTOP where the owner types the login; nothing is sent to the server or the AI."""
    site = re.sub(r"[^A-Za-z0-9 .\-_]", "", str(args.get("site", "")))[:60]
    if not site:
        raise ValueError("site ka naam chahiye")
    exe = [sys.executable] if getattr(sys, "frozen", False) else [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "jarvis_app.py")]
    subprocess.Popen(exe + ["--vault", site])
    return f"Laptop par '{site}' ka login daalne wali window khul gayi hai. Wahan username/password daal do (ye server ya AI ko nahi jata)."


def vault_fill(args):
    """Types the saved username, Tab, password, Enter into the window that is in front (open the login page first)."""
    import uiautomation as auto

    site = str(args.get("site", ""))
    entry = vault_load().get(site)
    if not entry:
        raise LookupError(f"'{site}' vault me nahi hai (pehle vault_ask)")
    guard()
    with auto.UIAutomationInitializerInThread():
        for text, key in ((entry["user"], "{Tab}"), (entry["pass"], "{Enter}" if args.get("submit", True) else "")):
            auto.SetClipboardText(text)
            auto.SendKeys("{Ctrl}v", waitTime=0.25)
            if key:
                auto.SendKeys(key, waitTime=0.3)
        auto.SetClipboardText("")  # do not leave the password on the clipboard
    return f"'{site}' ka login bhar diya"


def vault_window(site):
    """The small dialog opened by `JarvisAgent.exe --vault <site>` (called from jarvis_app)."""
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("Jarvis vault: " + site)
    root.geometry("380x230")
    root.attributes("-topmost", True)
    f = ttk.Frame(root, padding=14)
    f.pack(fill="both", expand=True)
    ttk.Label(f, text=f"'{site}' ka login (sirf is laptop par, encrypted)", wraplength=340).pack(anchor="w")
    ttk.Label(f, text="Username / email").pack(anchor="w", pady=(10, 0))
    u = ttk.Entry(f, width=44)
    u.pack()
    ttk.Label(f, text="Password").pack(anchor="w", pady=(8, 0))
    p = ttk.Entry(f, width=44, show="*")
    p.pack()
    msg = ttk.Label(f, text="")
    msg.pack(anchor="w", pady=6)

    def save():
        if not u.get().strip() or not p.get():
            msg.config(text="Dono bharo")
            return
        data = vault_load()
        data[site] = {"user": u.get().strip(), "pass": p.get()}
        vault_save(data)
        msg.config(text="Save ho gaya")
        root.after(900, root.destroy)

    ttk.Button(f, text="Save", command=save).pack(anchor="e")
    u.focus_set()
    root.mainloop()


# ------------------------------------------------------------------ the operate loop: look, decide, act, repeat
def post_progress(text):
    s, base, cmd = CTX["session"], CTX["base"], CTX["cmd"]
    if s and base and cmd:
        def send():
            try:
                s.post(base + "agent_progress", json={"id": cmd, "text": text[:400]}, timeout=15)
            except Exception:
                pass
        threading.Thread(target=send, daemon=True).start()  # a slow network must not slow the mouse down


def observe(window_hint=""):
    import uiautomation as auto
    import agent

    with auto.UIAutomationInitializerInThread():
        fg = (auto.GetForegroundControl().GetTopLevelControl().Name or "").strip()
        wins = [c.Name for c in auto.GetRootControl().GetChildren() if c.Name][:20]
    try:
        _, text = agent.read_window_text(window_hint if window_hint else "", max_chars=5000, budget_seconds=8)
    except Exception as e:
        text = f"(text nahi mila: {e})"
    return {"foreground": fg, "windows": wins, "text": text}


def operate(args):
    """Do `goal` on this PC step by step. The Jarvis server's AI decides each next step from what is on screen; the steps run here."""
    s, base = CTX["session"], CTX["base"]
    goal = str(args.get("goal", "")).strip()
    if not goal or not s:
        raise ValueError("goal chahiye")
    max_steps = max(1, min(int(args.get("max_steps", 15)), 30))
    hint = str(args.get("window", "")).strip()
    history = []
    post_progress("Shuru kar raha hoon: " + goal[:120])
    for n in range(1, max_steps + 1):
        obs = observe(hint)
        r = s.post(base + "operator_step", json={"goal": goal, "history": history[-8:], "obs": obs, "step": n, "max_steps": max_steps}, timeout=90)
        if r.status_code != 200:
            raise RuntimeError("operator_step: " + r.text[:200])
        plan = r.json()
        if plan.get("say"):
            post_progress(plan["say"])
        if plan.get("done"):
            return (plan.get("result") or plan.get("say") or "ho gaya") + f"\n(steps: {n})"
        ops = plan.get("ops") or []
        if not ops:
            history.append({"step": n, "note": "AI ne koi step nahi diya"})
            continue
        try:
            outcome = run_ops(ops)
        except Exception as e:
            outcome = f"ERROR {type(e).__name__}: {e}"
            if isinstance(e, PermissionError):
                post_progress(str(e))
                return "Ruk gaya: " + str(e)
        history.append({"step": n, "ops": ops, "outcome": outcome[:600]})
        time.sleep(1.0)
    return "Max steps pure ho gaye; kaam adhura ho sakta hai. Dekh lo ya dobara bolo.\n" + "\n".join(h.get("outcome", "")[:120] for h in history[-3:])


# ------------------------------------------------------------------ self-update of this exe
def _vtuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:4])


def check_update(session, base):
    """If the server has a newer JarvisAgent.exe: download, verify SHA-256, swap the file after this process exits, restart."""
    if not getattr(sys, "frozen", False):
        return "script mode: update skip"
    r = session.get(base + "app_update", params={"platform": "windows"}, timeout=30)
    if r.status_code != 200:
        return "no update info"
    info = r.json()
    if _vtuple(info.get("version", "0")) <= _vtuple(VERSION):
        return "latest"
    new = os.path.join(HOME, "JarvisAgent.new.exe")
    h = hashlib.sha256()
    with session.get(base + "app_update_file", params={"platform": "windows"}, stream=True, timeout=300) as dl:
        dl.raise_for_status()
        with open(new, "wb") as f:
            for chunk in dl.iter_content(1 << 20):
                h.update(chunk)
                f.write(chunk)
    if h.hexdigest() != info.get("sha256"):
        os.remove(new)
        return "update file galat (sha mismatch)"
    target = sys.executable
    bat = os.path.join(HOME, "apply_update.bat")
    with open(bat, "w", encoding="utf-8") as f:
        f.write(
            "@echo off\r\ntimeout /t 4 /nobreak >nul\r\n:retry\r\n"
            f'copy /y "{new}" "{target}" >nul 2>&1\r\nif errorlevel 1 (timeout /t 2 /nobreak >nul & goto retry)\r\n'
            f'del "{new}" >nul 2>&1\r\nstart "" "{target}"\r\ndel "%~f0"\r\n'
        )
    subprocess.Popen(["cmd", "/c", bat], creationflags=0x00000008 | 0x00000200, close_fds=True)  # DETACHED_PROCESS | NEW_PROCESS_GROUP
    os._exit(0)


def start_updater(session, base, stop):
    def loop():
        stop.wait(90)
        while not stop.is_set():
            try:
                check_update(session, base)
            except Exception:
                pass
            stop.wait(1800)

    threading.Thread(target=loop, daemon=True).start()

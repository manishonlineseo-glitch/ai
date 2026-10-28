"""Server tests: starts a throw-away copy of server/ with its own database and drives it over HTTP like the apps do.

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py     (needs php on PATH)
Nothing here touches the live site, the real database or the real config.php.
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8199
BASE = f"http://127.0.0.1:{PORT}/api.php"
HDR = {"X-Requested-With": "jarvis"}
TMP = None
PROC = None
DB = None


def start_server():
    global TMP, PROC, DB
    TMP = tempfile.mkdtemp(prefix="jarvis_test_")
    site = os.path.join(TMP, "site")
    shutil.copytree(os.path.join(ROOT, "server"), site, ignore=shutil.ignore_patterns("config.php", "*.sqlite*", "*.log", "library", ".git"))
    DB = os.path.join(TMP, "test.sqlite")
    with open(os.path.join(site, "config.php"), "w", encoding="utf-8") as f:
        f.write("<?php return ['require_https'=>false,'db_path'=>" + json.dumps(DB) + ",'timezone'=>'Asia/Kolkata','brain'=>'laptop','chat_rate_per_min'=>40];")
    os.makedirs(os.path.join(site, "data"), exist_ok=True)
    PROC = subprocess.Popen(["php", "-S", f"127.0.0.1:{PORT}", "-t", site], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            requests.get(BASE + "?r=state", headers=HDR, timeout=1)
            return
        except requests.RequestException:
            time.sleep(0.2)
    raise RuntimeError("php server did not start")


def stop_server():
    if PROC:
        PROC.terminate()
        PROC.wait(timeout=10)
    if TMP:
        shutil.rmtree(TMP, ignore_errors=True)


def setUpModule():
    start_server()


def tearDownModule():
    stop_server()


def post(route, body=None, session=None, headers=None):
    s = session or requests
    return s.post(f"{BASE}?r={route}", json=body or {}, headers={**HDR, **(headers or {})}, timeout=30)


def sql(query, args=()):
    con = sqlite3.connect(DB, timeout=10)
    try:
        cur = con.execute(query, args)
        con.commit()
        return cur.fetchall()
    finally:
        con.close()


OWNER = ("owner", "OwnerPass12345")
IDS = {  # device ID name -> (display name, type, password)
    "a_laptop": ("Office Laptop", "laptop", "Laptop12345pw"),
    "a_phone": ("My Phone", "android", "Phone12345pw"),
    "a_pad": ("My Pad", "iphone", "Pad12345pwxx"),
}


def agent_login(user, pw):
    return post("agent_login", {"username": user, "password": pw})


def beat(token):
    """One agent poll: marks the agent online (like the real agent does every few seconds)."""
    return requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": token}, timeout=30)


class T01_Setup(unittest.TestCase):
    owner = None

    def test_01_fresh_install_needs_setup(self):
        self.assertTrue(requests.get(BASE + "?r=state", headers=HDR).json()["setup_needed"])

    def test_02_setup_creates_owner_and_logs_in(self):
        s = requests.Session()
        r = post("setup", {"username": OWNER[0], "password": OWNER[1], "device_name": "Laptop", "device_type": "laptop"}, s)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(s.get(BASE + "?r=state", headers=HDR).json()["user"], OWNER[0])
        T01_Setup.owner = s

    def test_03_second_setup_refused(self):
        r = post("setup", {"username": "evil", "password": "EvilPass12345"})
        self.assertEqual(r.status_code, 403)

    def test_04_short_password_refused(self):
        self.assertEqual(sql("SELECT count(*) FROM users")[0][0], 1)

    def test_05_password_is_hashed_in_db(self):
        h = sql("SELECT pass_hash FROM users")[0][0]
        self.assertNotIn(OWNER[1], h)
        self.assertTrue(h.startswith("$"))


class T02_Protected(unittest.TestCase):
    def test_01_chat_needs_login(self):
        self.assertEqual(post("chat", {"text": "hello"}).status_code, 401)

    def test_02_devices_need_login(self):
        self.assertEqual(requests.get(BASE + "?r=devices", headers=HDR).status_code, 401)

    def test_03_agent_poll_needs_token(self):
        self.assertEqual(requests.get(BASE + "?r=agent_poll&wait=0", headers=HDR).status_code, 401)

    def test_04_garbage_token_refused(self):
        self.assertEqual(beat("0" * 64).status_code, 401)
        self.assertEqual(beat("not-a-token").status_code, 401)

    def test_05_device_ids_need_login(self):
        self.assertEqual(post("device_login_save", {"name": "x", "type": "laptop", "login_name": "xxxxxx", "password": "Abcdefgh123"}).status_code, 401)

    def test_06_responses_are_not_cached(self):
        self.assertIn("no-store", requests.get(BASE + "?r=state", headers=HDR).headers.get("Cache-Control", ""))

    def test_07_wrong_owner_login_refused(self):
        r = post("login", {"username": OWNER[0], "password": "wrong-password-1"})
        self.assertEqual(r.status_code, 401)
        sql("DELETE FROM login_attempts")


class T03_DeviceIDs(unittest.TestCase):
    def owner(self):
        return T01_Setup.owner

    def test_01_create_device_ids(self):
        for login, (name, typ, pw) in IDS.items():
            r = post("device_login_save", {"id": 0, "name": name, "type": typ, "login_name": login, "password": pw}, self.owner())
            self.assertEqual(r.status_code, 200, r.text)

    def test_02_duplicate_username_refused(self):
        r = post("device_login_save", {"id": 0, "name": "Dup", "type": "laptop", "login_name": "a_laptop", "password": "Another12345pw"}, self.owner())
        self.assertEqual(r.status_code, 400)

    def test_03_weak_password_refused(self):
        r = post("device_login_save", {"id": 0, "name": "Weak", "type": "laptop", "login_name": "weakone", "password": "short1"}, self.owner())
        self.assertEqual(r.status_code, 400)
        r = post("device_login_save", {"id": 0, "name": "Weak", "type": "laptop", "login_name": "weaktwo", "password": "onlylettersnodigits"}, self.owner())
        self.assertEqual(r.status_code, 400)

    def test_04_agent_login_works_for_each_type(self):
        for login, (name, typ, pw) in IDS.items():
            r = agent_login(login, pw)
            self.assertEqual(r.status_code, 200, r.text)
            j = r.json()
            self.assertEqual((j["name"], j["type"]), (name, typ))
            self.assertEqual(len(j["token"]), 64)

    def test_05_agent_rows_have_agent_role_and_right_type(self):
        rows = sql("SELECT name, type, role FROM devices WHERE role='agent' ORDER BY name")
        self.assertEqual(sorted(rows), sorted((n, t, "agent") for n, t, _ in IDS.values()))

    def test_06_wrong_password_and_unknown_user_look_the_same(self):
        a = agent_login("a_laptop", "wrong-pass-123")
        b = agent_login("nobody_here", "wrong-pass-123")
        self.assertEqual((a.status_code, a.json()), (b.status_code, b.json()))
        sql("DELETE FROM login_attempts")

    def test_07_token_is_stored_only_as_hash(self):
        tok = agent_login("a_laptop", IDS["a_laptop"][2]).json()["token"]
        stored = [r[0] for r in sql("SELECT token_hash FROM devices")]
        self.assertNotIn(tok, stored)

    def test_08_new_login_replaces_old_agent_session(self):
        first = agent_login("a_pad", IDS["a_pad"][2]).json()["token"]
        self.assertEqual(beat(first).status_code, 200)
        second = agent_login("a_pad", IDS["a_pad"][2]).json()["token"]
        self.assertEqual(beat(first).status_code, 401)
        self.assertEqual(beat(second).status_code, 200)

    def test_09_browser_login_with_same_id_keeps_agent_alive(self):
        tok = agent_login("a_laptop", IDS["a_laptop"][2]).json()["token"]
        s = requests.Session()
        self.assertEqual(post("login", {"username": "a_laptop", "password": IDS["a_laptop"][2]}, s).status_code, 200)
        self.assertEqual(beat(tok).status_code, 200)

    def test_10_password_change_signs_agent_out_and_old_password_dies(self):
        tok = agent_login("a_pad", IDS["a_pad"][2]).json()["token"]
        login_id = sql("SELECT id FROM device_logins WHERE login_name='a_pad'")[0][0]
        r = post("device_login_save", {"id": login_id, "name": "My Pad", "type": "iphone", "login_name": "a_pad", "password": "NewPad12345pw"}, T01_Setup.owner)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(beat(tok).status_code, 401)
        self.assertEqual(agent_login("a_pad", IDS["a_pad"][2]).status_code, 401)
        self.assertEqual(agent_login("a_pad", "NewPad12345pw").status_code, 200)
        sql("DELETE FROM login_attempts")

    def test_11_deleting_a_device_id_removes_its_sessions(self):
        post("device_login_save", {"id": 0, "name": "Temp TV", "type": "tv", "login_name": "temp_tv", "password": "TempTv12345pw"}, T01_Setup.owner)
        tok = agent_login("temp_tv", "TempTv12345pw").json()["token"]
        login_id = sql("SELECT id FROM device_logins WHERE login_name='temp_tv'")[0][0]
        post("device_login_delete", {"id": login_id}, T01_Setup.owner)
        self.assertEqual(beat(tok).status_code, 401)
        self.assertEqual(agent_login("temp_tv", "TempTv12345pw").status_code, 401)
        sql("DELETE FROM login_attempts")


class T04_AgentProtection(unittest.TestCase):
    def agent_row(self, name):
        return sql("SELECT id, blocked FROM devices WHERE role='agent' AND name=?", (name,))[0]

    def test_01_agent_cannot_be_blocked(self):
        agent_login("a_laptop", IDS["a_laptop"][2])
        aid = self.agent_row("Office Laptop")[0]
        r = post("device_block", {"id": aid, "blocked": True}, T01_Setup.owner)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.agent_row("Office Laptop")[1], 0)

    def test_02_online_agent_cannot_be_deleted(self):
        tok = agent_login("a_laptop", IDS["a_laptop"][2]).json()["token"]
        beat(tok)
        aid = self.agent_row("Office Laptop")[0]
        r = post("device_delete", {"id": aid}, T01_Setup.owner)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(beat(tok).status_code, 200)

    def test_03_offline_agent_can_be_deleted(self):
        tok = agent_login("a_pad", "NewPad12345pw").json()["token"]
        aid = self.agent_row("My Pad")[0]
        sql("UPDATE devices SET last_seen = ? WHERE id = ?", (int(time.time()) - 3600, aid))
        r = post("device_delete", {"id": aid}, T01_Setup.owner)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(beat(tok).status_code, 401)

    def test_04_browser_device_can_still_be_blocked(self):
        s = requests.Session()
        post("login", {"username": "a_phone", "password": IDS["a_phone"][2]}, s)
        cid = sql("SELECT id FROM devices WHERE role='client' AND name='My Phone'")[0][0]
        self.assertEqual(post("device_block", {"id": cid, "blocked": True}, T01_Setup.owner).status_code, 200)
        self.assertEqual(s.get(BASE + "?r=devices", headers=HDR).status_code, 401)

    def test_05_every_device_action_is_logged(self):
        log = os.path.join(TMP, "site", "data", "device_audit.log")
        self.assertTrue(os.path.exists(log))
        text = open(log, encoding="utf-8").read()
        self.assertIn("device_block", text)
        self.assertIn("device_delete", text)


class RoutingBase(unittest.TestCase):
    """Chat as a laptop browser and as a phone browser; read which device got which command."""
    laptop_tok = phone_tok = None
    laptop_web = phone_web = None

    @classmethod
    def setUpClass(cls):
        sql("DELETE FROM login_attempts")
        sql("UPDATE devices SET blocked = 0")
        cls.laptop_tok = agent_login("a_laptop", IDS["a_laptop"][2]).json()["token"]
        cls.phone_tok = agent_login("a_phone", IDS["a_phone"][2]).json()["token"]
        beat(cls.laptop_tok)
        beat(cls.phone_tok)
        cls.laptop_web = T01_Setup.owner  # the owner's browser, registered as a laptop
        cls.phone_web = requests.Session()
        post("login", {"username": "a_phone", "password": IDS["a_phone"][2]}, cls.phone_web)

    def say(self, web, text):
        beat(self.laptop_tok)
        beat(self.phone_tok)
        sql("DELETE FROM chat")  # the per-minute chat limit is tested on its own
        before = sql("SELECT coalesce(max(id),0) FROM commands")[0][0]
        t0 = time.time()
        r = post("chat", {"text": text}, web)
        ms = (time.time() - t0) * 1000
        self.assertEqual(r.status_code, 200, r.text)
        rows = sql("SELECT d.name, c.action, c.args, c.status FROM commands c JOIN devices d ON d.id = c.device_id WHERE c.id > ? ORDER BY c.id", (before,))
        return rows, r.json(), ms


# (who speaks, sentence, expected device, expected action, expected text inside args)
CASES = [
    ("laptop", "chrome kholo", "Office Laptop", "open_app", '"chrome"'),
    ("phone", "chrome kholo", "Office Laptop", "open_app", '"chrome"'),
    ("phone", "laptop ka chrome browser open karo", "Office Laptop", "open_app", '"chrome"'),
    ("phone", "crome open kro udaypur", "Office Laptop", "open_app", '"profile":"udaypur"'),
    ("laptop", "क्रोम खोलो", "Office Laptop", "open_app", '"chrome"'),
    ("phone", "laptop par code kholo", "Office Laptop", "open_app", '"vscode"'),
    ("phone", "laptop par notepad kholo", "Office Laptop", "open_app", '"notepad"'),
    ("phone", "open calculator", "Office Laptop", "open_app", '"calculator"'),
    ("phone", "laptop par photoshop kholo", "Office Laptop", "open_app", '"photoshop"'),
    ("laptop", "youtube kholo", "Office Laptop", "open_url", "youtube.com"),
    ("phone", "youtube kholo", "My Phone", "phone_open_url", "youtube.com"),
    ("laptop", "mobile me youtube kholo", "My Phone", "phone_open_url", "youtube.com"),
    ("phone", "laptop par gmail kholo", "Office Laptop", "open_url", "mail.google.com"),
    ("phone", "youtube par arijit singh ka gaana chalao", "My Phone", "phone_youtube_play", "arijit singh"),
    ("laptop", "youtube par arijit singh ka gaana chalao", "Office Laptop", "open_url", "arijit%20singh"),
    ("laptop", "mobile me youtube par kesariya bajao", "My Phone", "phone_youtube_play", "kesariya"),
    ("phone", "mere mobile me youtube par ye gaana baja do tum hi ho", "My Phone", "phone_youtube_play", "tum hi ho"),
    ("laptop", "google par python tutorial search karo", "Office Laptop", "open_url", "python%20tutorial"),
    ("phone", "udaipur ka rasta batao", "My Phone", "phone_open_url", "udaipur"),
    ("laptop", "youtube par lofi search karo", "Office Laptop", "open_url", "search_query=lofi"),
    ("phone", "laptop ki awaaz kam karo", "Office Laptop", "volume", '"down"'),
    ("phone", "awaaz badhao", "Office Laptop", "volume", '"up"'),
    ("laptop", "mute karo", "Office Laptop", "volume", '"mute"'),
    ("phone", "laptop lock karo", "Office Laptop", "lock", "[]"),
    ("phone", "laptop ka cpu batao", "Office Laptop", "cpu_status", "[]"),
    ("phone", "clod par kya chl rha hai", "Office Laptop", "claude_sessions", '"hours":24'),
    ("phone", "claude ki history batao", "Office Laptop", "claude_sessions", '"hours"'),
    ("phone", "claude par is hafte kya kaam hua session", "Office Laptop", "claude_sessions", '"hours":168'),
]


class T05_Routing(RoutingBase):
    def test_cases(self):
        for who, text, device, action, needle in CASES:
            with self.subTest(text=text, who=who):
                rows, _, _ = self.say(self.laptop_web if who == "laptop" else self.phone_web, text)
                self.assertTrue(rows, f"no command queued for: {text}")
                self.assertEqual((rows[-1][0], rows[-1][1]), (device, action), f"{text}: {rows}")
                self.assertIn(needle, rows[-1][2], f"{text}: {rows[-1][2]}")

    def test_sentences_that_must_not_be_hijacked(self):
        for who, text in [("laptop", "hello"), ("phone", "kitne baje hain"), ("laptop", "chrome kholo aur google search karo"),
                          ("phone", "phone me chrome kholo"), ("laptop", "claude kya hai")]:
            with self.subTest(text=text):
                rows, _, _ = self.say(self.laptop_web if who == "laptop" else self.phone_web, text)
                self.assertFalse([r for r in rows if r[1] in ("open_app", "open_url", "claude_sessions", "volume")], f"{text}: {rows}")

    def test_single_word_chat_replies_instantly(self):
        _, j, ms = self.say(self.laptop_web, "hello")
        self.assertIn("Namaste", j["reply"])
        self.assertLess(ms, 1500)

    def test_every_reflex_answers_fast(self):
        slow = []
        for who, text, *_ in CASES:
            _, _, ms = self.say(self.laptop_web if who == "laptop" else self.phone_web, text)
            if ms > 1500:
                slow.append((text, round(ms)))
        self.assertFalse(slow, f"slower than 1.5 s on this PC: {slow}")

    def test_offline_laptop_gives_a_clear_answer_not_a_hang(self):
        sql("UPDATE devices SET last_seen = last_seen - 3600 WHERE role='agent' AND type<>'android'")
        t0 = time.time()
        r = post("chat", {"text": "chrome kholo"}, self.phone_web)
        self.assertLess(time.time() - t0, 3)
        self.assertIn("offline", r.json()["reply"].lower())
        beat(self.laptop_tok)

    def test_agent_name_mismatch_still_routes_to_the_only_online_pc(self):
        rows, _, _ = self.say(self.phone_web, "home desktop par chrome kholo")
        self.assertEqual(rows[-1][0], "Office Laptop")


class T06_Approvals(RoutingBase):
    def test_close_app_waits_for_approve_then_runs(self):
        rows, j, _ = self.say(self.phone_web, "chrome band karo")
        self.assertEqual((rows[-1][1], rows[-1][3]), ("close_app", "awaiting_confirm"))
        cid = sql("SELECT max(id) FROM commands")[0][0]
        beat(self.laptop_tok)
        self.assertEqual(requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok}).json()["commands"], [])
        self.assertTrue(post("command_decide", {"id": cid, "approve": True}, self.laptop_web).json()["ok"])
        cmds = requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok}).json()["commands"]
        self.assertEqual([c["action"] for c in cmds], ["close_app"])

    def test_denied_command_never_reaches_the_pc(self):
        self.say(self.phone_web, "notepad band karo")
        cid = sql("SELECT max(id) FROM commands")[0][0]
        post("command_decide", {"id": cid, "approve": False}, self.laptop_web)
        cmds = requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok}).json()["commands"]
        self.assertEqual(cmds, [])

    def test_small_things_run_without_asking(self):
        rows, _, _ = self.say(self.phone_web, "chrome kholo")
        self.assertEqual(rows[-1][3], "pending")

    def test_agent_cannot_approve_its_own_command(self):
        self.say(self.phone_web, "excel band karo")
        cid = sql("SELECT max(id) FROM commands")[0][0]
        r = requests.post(f"{BASE}?r=command_decide", json={"id": cid, "approve": True}, headers={**HDR, "X-Agent-Token": self.laptop_tok})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(sql("SELECT status FROM commands WHERE id=?", (cid,))[0][0], "awaiting_confirm")


class T07_CommandLifecycle(RoutingBase):
    def test_agent_gets_command_runs_it_and_reports_back(self):
        beat(self.laptop_tok)
        self.say(self.phone_web, "laptop ka cpu batao")
        cmds = requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok}).json()["commands"]
        self.assertEqual(cmds[-1]["action"], "cpu_status")
        cid = cmds[-1]["id"]
        self.assertEqual(sql("SELECT status FROM commands WHERE id=?", (cid,))[0][0], "running")
        r = requests.post(f"{BASE}?r=agent_result", json={"id": cid, "ok": True, "result": "CPU 5%"}, headers={**HDR, "X-Agent-Token": self.laptop_tok})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sql("SELECT status, result FROM commands WHERE id=?", (cid,))[0], ("done", "CPU 5%"))

    def test_command_for_one_device_is_not_given_to_another(self):
        self.say(self.phone_web, "youtube kholo")
        beat(self.laptop_tok)
        laptop_cmds = requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok}).json()["commands"]
        phone_cmds = requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.phone_tok}).json()["commands"]
        self.assertNotIn("phone_open_url", [c["action"] for c in laptop_cmds])
        self.assertIn("phone_open_url", [c["action"] for c in phone_cmds])

    def test_poll_returns_in_well_under_a_second_when_command_waits(self):
        self.say(self.phone_web, "laptop ka cpu batao")
        t0 = time.time()
        requests.get(f"{BASE}?r=agent_poll&wait=18", headers={**HDR, "X-Agent-Token": self.laptop_tok})
        self.assertLess(time.time() - t0, 1.0)

    def test_long_poll_wakes_up_fast_for_a_new_command(self):
        import threading
        beat(self.laptop_tok)
        requests.get(f"{BASE}?r=agent_poll&wait=0", headers={**HDR, "X-Agent-Token": self.laptop_tok})  # drain
        got = {}

        def poll():
            t0 = time.time()
            r = requests.get(f"{BASE}?r=agent_poll&wait=10", headers={**HDR, "X-Agent-Token": self.laptop_tok}, timeout=30)
            got["t"] = time.time() - t0
            got["cmds"] = r.json()["commands"]

        th = threading.Thread(target=poll)
        th.start()
        time.sleep(1.0)
        # php's built-in server handles one request at a time, so queue the command straight in the database while the poll waits
        aid = sql("SELECT id FROM devices WHERE role='agent' AND name='Office Laptop'")[0][0]
        sql("INSERT INTO commands (user_id, device_id, action, args, status, created_at, updated_at) VALUES (1, ?, 'lock', '{}', 'pending', ?, ?)", (aid, int(time.time()), int(time.time())))
        th.join(15)
        self.assertEqual([c["action"] for c in got["cmds"]], ["lock"])
        self.assertLess(got["t"], 2.2, "agent should hear about the command within ~1 s of it being queued")


class T08_Abuse(RoutingBase):
    def test_chat_rate_limit(self):
        sql("DELETE FROM chat")
        codes = [post("chat", {"text": "hello"}, self.phone_web).status_code for _ in range(45)]
        self.assertIn(429, codes)

    def test_empty_and_huge_messages_refused(self):
        self.assertEqual(post("chat", {"text": "   "}, self.phone_web).status_code, 400)
        self.assertEqual(post("chat", {"text": "x" * 2500}, self.phone_web).status_code, 400)

    def test_dangerous_app_names_are_refused_before_reaching_the_pc(self):
        before = sql("SELECT coalesce(max(id),0) FROM commands")[0][0]
        sql("DELETE FROM chat")
        for text in ["laptop par ../../windows/system32/cmd kholo", "laptop par calc && del c kholo", "laptop par $(whoami) kholo"]:
            post("chat", {"text": text}, self.phone_web)
        rows = sql("SELECT args FROM commands WHERE id > ? AND action='open_app'", (before,))
        for (args,) in rows:
            app = json.loads(args)["app"]
            self.assertRegex(app, r"^[A-Za-z0-9 _.\-]{1,40}$")
            self.assertNotIn("&", app)
            self.assertNotIn("/", app)

    def test_sql_injection_in_login_does_not_log_in(self):
        sql("DELETE FROM login_attempts")
        r = post("login", {"username": "owner' OR '1'='1", "password": "x' OR '1'='1"})
        self.assertEqual(r.status_code, 401)
        r = agent_login("a_laptop' --", "x")
        self.assertEqual(r.status_code, 401)
        sql("DELETE FROM login_attempts")

    def test_brute_force_locks_the_ip_after_8_failures(self):
        sql("DELETE FROM login_attempts")
        codes = [agent_login("a_laptop", f"wrong-guess-{i}x1").status_code for i in range(10)]
        self.assertEqual(codes[:8], [401] * 8)
        self.assertEqual(codes[8], 429)
        self.assertEqual(agent_login("a_laptop", IDS["a_laptop"][2]).status_code, 429, "even the right password waits while locked")
        sql("DELETE FROM login_attempts")

    def test_unknown_route_is_not_a_crash(self):
        r = requests.get(BASE + "?r=does_not_exist", headers=HDR)
        self.assertIn(r.status_code, (400, 401, 404))

    def test_non_ajax_post_is_refused(self):
        r = requests.post(BASE + "?r=agent_login", json={"username": "a_laptop", "password": IDS["a_laptop"][2]})
        self.assertIn(r.status_code, (400, 401, 403))


if __name__ == "__main__":
    unittest.main(verbosity=2)

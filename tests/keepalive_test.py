"""Keep-alive tests: offline/back-online alerts, the agent surviving stray errors, the keep-awake request, the Task Scheduler script.

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "agent"))
os.environ.setdefault("JARVIS_AGENT_HOME", tempfile.mkdtemp(prefix="jarvis_ka_test_"))

import agent  # noqa: E402
import server_test as st  # noqa: E402

OWNER = None


def setUpModule():
    global OWNER
    st.start_server()
    OWNER = requests.Session()
    st.post("setup", {"username": "owner", "password": "OwnerPass12345", "device_name": "Laptop", "device_type": "laptop"}, OWNER)
    for login, name, typ, pw in [("ka_laptop", "KA Laptop", "laptop", "KaLaptop12345pw"), ("ka_phone", "KA Phone", "android", "KaPhone12345pw")]:
        st.post("device_login_save", {"id": 0, "name": name, "type": typ, "login_name": login, "password": pw}, OWNER)


def tearDownModule():
    st.stop_server()


class Base(unittest.TestCase):
    def setUp(self):
        st.sql("DELETE FROM login_attempts")
        st.sql("DELETE FROM commands")
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%' OR k LIKE 'agent_state_%' OR k LIKE 'watchdog_%'")
        self.lap = st.agent_login("ka_laptop", "KaLaptop12345pw").json()["token"]
        self.pho = st.agent_login("ka_phone", "KaPhone12345pw").json()["token"]
        self.lap_id = st.sql("SELECT id FROM devices WHERE role='agent' AND name='KA Laptop'")[0][0]
        st.beat(self.lap)
        st.beat(self.pho)

    def notes(self):
        return [json.loads(a)["text"] for (a,) in st.sql("SELECT args FROM commands WHERE action='phone_notify' ORDER BY id")]

    def tick_watchdog(self):
        st.sql("DELETE FROM kv WHERE k = 'watchdog_last'")  # the 20 s throttle
        st.beat(self.pho)

    def make_laptop_stale(self, seconds=400):
        st.sql("UPDATE devices SET last_seen = ? WHERE id = ?", (int(time.time()) - seconds, self.lap_id))


class T50_OfflineAlerts(Base):
    def test_laptop_going_quiet_alerts_the_phone_once(self):
        self.tick_watchdog()  # records the laptop as online
        self.make_laptop_stale(400)
        self.tick_watchdog()
        text = " | ".join(self.notes())
        self.assertIn("KA Laptop", text)
        self.assertIn("offline", text.lower())
        self.assertIn("minute", text)
        self.tick_watchdog()
        self.tick_watchdog()
        self.assertEqual(len([n for n in self.notes() if "offline" in n.lower()]), 1, "no repeat while it stays offline")

    def test_coming_back_is_announced(self):
        self.tick_watchdog()
        self.make_laptop_stale(400)
        self.tick_watchdog()
        st.beat(self.lap)
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        self.tick_watchdog()
        self.assertTrue(any("wapas online" in n for n in self.notes()), self.notes())

    def test_a_short_gap_is_not_an_alert(self):
        self.tick_watchdog()
        self.make_laptop_stale(60)  # under the 3 minute limit
        self.tick_watchdog()
        self.assertEqual([n for n in self.notes() if "offline" in n.lower()], [])

    def test_a_device_that_was_never_online_is_not_reported(self):
        st.sql("DELETE FROM kv WHERE k LIKE 'agent_state_%'")
        self.make_laptop_stale(5000)
        self.tick_watchdog()
        self.assertEqual([n for n in self.notes() if "KA Laptop" in n], [])

    def test_after_a_server_outage_nobody_is_blamed_straight_away(self):
        self.tick_watchdog()
        self.make_laptop_stale(400)
        st.sql("UPDATE kv SET v = ? WHERE k = 'watchdog_last'", (str(int(time.time()) - 900),))  # nobody polled for 15 minutes
        st.beat(self.pho)
        self.assertEqual([n for n in self.notes() if "KA Laptop" in n], [], "grace period after silence")
        st.sql("DELETE FROM kv WHERE k = 'watchdog_last'")
        st.sql("UPDATE kv SET v = ? WHERE k = 'watchdog_grace_until'", (str(int(time.time()) - 1),))
        st.beat(self.pho)
        self.assertTrue(any("KA Laptop" in n and "offline" in n.lower() for n in self.notes()), "judged once the grace is over")

    def test_alert_is_also_written_to_the_security_log(self):
        self.tick_watchdog()
        self.make_laptop_stale(400)
        self.tick_watchdog()
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("[offline_", log)

    def test_watchdog_runs_from_the_scheduler_too(self):
        self.tick_watchdog()
        self.make_laptop_stale(400)
        st.sql("DELETE FROM kv WHERE k = 'watchdog_last' OR k = 'sched_lock'")
        self.assertEqual(OWNER.get(f"{st.BASE}?r=tick", headers=st.HDR).status_code, 200)
        self.assertTrue(any("KA Laptop" in n for n in self.notes()))

    def test_blocked_or_deleted_devices_are_ignored(self):
        self.tick_watchdog()
        st.sql("DELETE FROM devices WHERE id = ?", (self.lap_id,))
        self.tick_watchdog()
        self.assertEqual([n for n in self.notes() if "KA Laptop" in n], [])


class T51_AgentSurvives(unittest.TestCase):
    def test_a_stray_error_in_the_loop_does_not_end_the_agent(self):
        calls = {"n": 0}
        stop = threading.Event()
        states = []

        class FakeSession:
            headers = {}

            def __init__(self):
                self.headers = {}

            def get(self, url, **kw):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise ValueError("bad json from a proxy")  # not a RequestException
                if calls["n"] >= 3:
                    stop.set()
                r = mock.Mock(status_code=200, headers={"Content-Type": "application/json"})
                r.json.return_value = {"commands": []}
                r.raise_for_status.return_value = None
                return r

            def post(self, *a, **k):
                return mock.Mock(status_code=200)

        cfg = {"token": "a" * 64, "server_url": "https://x.test/", "poll_seconds": 0, "projects": {}, "apps": {}, "allowed_actions": set(), "keep_awake": False}
        with mock.patch.object(agent.requests, "Session", FakeSession), mock.patch.object(agent.ops, "start_updater"):
            original_wait = stop.wait
            stop.wait = lambda t=None: original_wait(0.01)  # do not really sleep 10 s
            t = threading.Thread(target=agent.run, args=(cfg, stop, states.append), daemon=True)
            t.start()
            t.join(10)
        self.assertFalse(t.is_alive(), "the loop ended only because the test told it to stop")
        self.assertGreaterEqual(calls["n"], 3, "it kept polling after the error")
        self.assertIn("offline", states)
        self.assertIn("online", states)

    def test_agent_loop_has_a_catch_all_for_unexpected_errors(self):
        src = open(os.path.join(ROOT, "agent", "agent.py"), encoding="utf-8").read()
        self.assertIn("except Exception as e:  # anything else", src)

    def test_tray_watchdog_is_wired_in(self):
        src = open(os.path.join(ROOT, "agent", "jarvis_app.py"), encoding="utf-8").read()
        for must in ("def watchdog():", "not t.is_alive()", "threading.Thread(target=watchdog", "quitting.set()"):
            self.assertIn(must, src)


class T52_KeepAwake(unittest.TestCase):
    def run_loop(self, plugged):
        stop = threading.Event()
        flags = []
        fake_kernel = mock.Mock()
        fake_kernel.SetThreadExecutionState.side_effect = lambda f: flags.append(f)
        battery = None if plugged is None else mock.Mock(power_plugged=plugged)
        with mock.patch.object(agent.ctypes.windll, "kernel32", fake_kernel), mock.patch.object(agent.psutil, "sensors_battery", return_value=battery):
            t = threading.Thread(target=agent.keep_awake_loop, args=(stop, 0.01), daemon=True)
            t.start()
            time.sleep(0.15)
            stop.set()
            t.join(5)
        return flags

    def test_on_mains_power_the_pc_is_kept_awake(self):
        flags = self.run_loop(True)
        self.assertEqual(flags[0], agent.ES_CONTINUOUS | agent.ES_SYSTEM_REQUIRED)

    def test_desktop_without_a_battery_is_kept_awake(self):
        self.assertEqual(self.run_loop(None)[0], agent.ES_CONTINUOUS | agent.ES_SYSTEM_REQUIRED)

    def test_on_battery_the_normal_power_plan_applies(self):
        self.assertEqual(self.run_loop(False)[0], agent.ES_CONTINUOUS)

    def test_the_request_is_released_when_the_agent_stops(self):
        self.assertEqual(self.run_loop(True)[-1], agent.ES_CONTINUOUS)

    def test_it_asks_only_once_per_change_not_every_30_seconds(self):
        self.assertLessEqual(len(self.run_loop(True)), 2)


class T53_TaskSchedulerScript(unittest.TestCase):
    PS1 = os.path.join(ROOT, "agent", "install_keepalive.ps1")

    def test_script_parses_without_errors(self):
        cmd = ("$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" + self.PS1 + "',[ref]$t,[ref]$e);"
               "if($e.Count){$e|ForEach-Object{$_.Message};exit 1}")
        out = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)

    def test_script_has_the_settings_that_keep_the_agent_alive(self):
        src = open(self.PS1, encoding="utf-8").read()
        for must in ("-AtLogOn", "-RepetitionInterval (New-TimeSpan -Minutes 5)", "-RestartCount 99", "-MultipleInstances IgnoreNew", "-StartWhenAvailable",
                     "-AllowStartIfOnBatteries", "-DontStopIfGoingOnBatteries", "[TimeSpan]::Zero", "-LogonType Interactive", "-RunLevel Limited", "Unregister-ScheduledTask"):
            self.assertIn(must, src)

    def test_script_never_asks_for_admin_and_the_power_change_needs_a_typed_yes(self):
        src = open(self.PS1, encoding="utf-8").read()
        self.assertNotIn("RunLevel Highest", src)
        self.assertNotIn("-Verb RunAs", src)
        self.assertIn("Read-Host 'Type YES to apply'", src)
        self.assertLess(src.index("param("), src.index("powercfg"))

    def test_dry_run_builds_everything_and_changes_nothing(self):
        out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", self.PS1, "-DryRun", "-NoSleepOnPower"], capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn("DRYRUN task 'JarvisAgent KeepAlive'", out.stdout)
        self.assertIn("DRYRUN: would run powercfg", out.stdout)
        self.assertNotIn("created", out.stdout)
        check = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-ScheduledTask -TaskName 'JarvisAgent KeepAlive' -ErrorAction SilentlyContinue | Measure-Object).Count"],
                               capture_output=True, text=True)
        self.assertEqual(check.stdout.strip(), "0", "the dry run must not have registered a task")


if __name__ == "__main__":
    unittest.main(verbosity=2)

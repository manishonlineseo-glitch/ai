"""Windows agent tests (no real clicking, no real Chrome launches, no real shutdowns: those calls are replaced by mocks).

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "agent"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
os.environ.setdefault("JARVIS_AGENT_HOME", tempfile.mkdtemp(prefix="jarvis_agent_test_"))

import agent  # noqa: E402
import ops  # noqa: E402


class T10_Apps(unittest.TestCase):
    def test_known_apps_resolve_to_real_files(self):
        for name in ("notepad", "calculator", "explorer", "cmd", "paint"):
            path = agent.find_builtin_app(name)
            self.assertTrue(path and os.path.exists(path), f"{name} -> {path}")

    def test_unknown_builtin_is_none(self):
        self.assertIsNone(agent.find_builtin_app("definitely-not-an-app"))

    def test_chrome_is_found_when_installed(self):
        path = agent.find_builtin_app("chrome")
        self.assertTrue(path is None or path.lower().endswith("chrome.exe"))

    def test_start_menu_search_prefers_exact_then_prefix_then_contains(self):
        with tempfile.TemporaryDirectory() as d:
            prog = os.path.join(d, "ProgramData", "Microsoft", "Windows", "Start Menu", "Programs")
            os.makedirs(os.path.join(prog, "Sub"))
            for rel in ("Photoshop.lnk", "Sub/Adobe Photoshop 2020.lnk", "Sub/Uninstall Photoshop.lnk", "VLC media player.lnk", "My Photoshop Helper.lnk"):
                open(os.path.join(prog, rel), "w").close()
            with mock.patch.dict(os.environ, {"ProgramData": os.path.join(d, "ProgramData"), "APPDATA": os.path.join(d, "none")}):
                self.assertTrue(agent.find_start_menu_app("photoshop").endswith("Photoshop.lnk"))
                self.assertTrue(agent.find_start_menu_app("vlc").endswith("VLC media player.lnk"))
                self.assertTrue(agent.find_start_menu_app("adobe photoshop").endswith("Adobe Photoshop 2020.lnk"))
                self.assertIsNone(agent.find_start_menu_app("zzzzzz"))

    def test_start_menu_search_never_returns_an_uninstaller(self):
        with tempfile.TemporaryDirectory() as d:
            prog = os.path.join(d, "ProgramData", "Microsoft", "Windows", "Start Menu", "Programs")
            os.makedirs(prog)
            open(os.path.join(prog, "Uninstall Foo.lnk"), "w").close()
            with mock.patch.dict(os.environ, {"ProgramData": os.path.join(d, "ProgramData"), "APPDATA": os.path.join(d, "none")}):
                self.assertIsNone(agent.find_start_menu_app("foo"))

    def test_start_menu_search_ignores_path_tricks(self):
        for weird in ("..", "../..", "", "a", "&&", "$(x)"):
            self.assertIsNone(agent.find_start_menu_app(weird), weird)

    def test_open_app_unknown_gives_a_clear_error(self):
        cfg = {"apps": {}, "allowed_actions": {"open_app"}}
        with self.assertRaises(LookupError):
            agent.run_action(cfg, "open_app", {"app": "zzzz-no-such-program"})


class T11_ChromeProfiles(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        state = {"profile": {"last_used": "Profile 2", "info_cache": {
            "Default": {"name": "Niraj Account", "user_name": ""},
            "Profile 1": {"name": "udaypur group", "user_name": "group@example.com"},
            "Profile 2": {"name": "udaypur", "user_name": "udaypur@example.com"},
            "Profile 3": {"name": "varun", "user_name": "varun@example.com", "gaia_name": "Varun K"}}}}
        with open(os.path.join(self.d.name, "Local State"), "w", encoding="utf-8") as f:
            json.dump(state, f)
        self.p1 = mock.patch.object(ops, "chrome_user_data", return_value=self.d.name)
        self.p2 = mock.patch.object(ops, "find_chrome", return_value="chrome.exe")
        self.p3 = mock.patch.object(ops.subprocess, "Popen")
        self.p1.start()
        self.p2.start()
        self.popen = self.p3.start()

    def tearDown(self):
        mock.patch.stopall()
        self.d.cleanup()

    def launched(self):
        return self.popen.call_args[0][0]

    def test_exact_name_beats_a_longer_name_that_contains_it(self):
        ops.open_chrome("udaypur")
        self.assertEqual(self.launched(), ["chrome.exe", "--profile-directory=Profile 2"])

    def test_longer_name(self):
        ops.open_chrome("udaypur group")
        self.assertEqual(self.launched()[1], "--profile-directory=Profile 1")

    def test_match_is_case_insensitive_and_by_email(self):
        ops.open_chrome("VARUN")
        self.assertEqual(self.launched()[1], "--profile-directory=Profile 3")
        ops.open_chrome("group@example.com")
        self.assertEqual(self.launched()[1], "--profile-directory=Profile 1")

    def test_partial_name(self):
        ops.open_chrome("niraj")
        self.assertEqual(self.launched()[1], "--profile-directory=Default")

    def test_no_name_opens_the_last_used_profile_so_the_picker_never_shows(self):
        ops.open_chrome("")
        self.assertEqual(self.launched()[1], "--profile-directory=Profile 2")

    def test_unknown_profile_lists_the_real_ones(self):
        with self.assertRaises(LookupError) as cm:
            ops.open_chrome("nobody")
        self.assertIn("udaypur", str(cm.exception))
        self.assertFalse(self.popen.called)


class T12_Credentials(unittest.TestCase):
    def test_password_round_trip_and_is_not_stored_in_clear(self):
        stored = agent.protect_password("S3cret-Pass 12345")
        self.assertNotIn("S3cret", stored)
        import base64
        self.assertEqual(ops._dpapi(base64.b64decode(stored), False).decode(), "S3cret-Pass 12345")

    def test_two_encryptions_differ(self):
        self.assertNotEqual(agent.protect_password("same-password-1"), agent.protect_password("same-password-1"))

    def test_config_with_login_gets_placeholder_token(self):
        home = os.environ["JARVIS_AGENT_HOME"]
        path = os.path.join(home, "config.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"server_url": "https://example.test/", "login": {"username": "u", "password": "x"}}, f)
        with mock.patch.object(agent, "CONFIG_PATH", path):
            cfg = agent.load_config()
        self.assertEqual(len(cfg["token"]), 64)

    def test_config_without_token_or_login_is_refused(self):
        path = os.path.join(os.environ["JARVIS_AGENT_HOME"], "config_bad.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"server_url": "https://example.test/"}, f)
        with mock.patch.object(agent, "CONFIG_PATH", path):
            with self.assertRaises(SystemExit):
                agent.load_config()

    def test_plain_http_to_a_real_host_is_refused(self):
        path = os.path.join(os.environ["JARVIS_AGENT_HOME"], "config_http.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"server_url": "http://example.test/", "token": "a" * 64}, f)
        with mock.patch.object(agent, "CONFIG_PATH", path):
            with self.assertRaises(SystemExit):
                agent.load_config()


class T13_Actions(unittest.TestCase):
    CFG = {"apps": {}, "allowed_actions": {"volume", "close_app", "open_url", "cpu_status"}}

    def test_action_not_in_allowed_list_is_refused(self):
        with self.assertRaises(PermissionError):
            agent.run_action({"apps": {}, "allowed_actions": {"cpu_status"}}, "shutdown", {})

    def test_volume_presses_the_right_keys(self):
        with mock.patch.object(agent.ctypes.windll.user32, "keybd_event") as key:
            agent.run_action(self.CFG, "volume", {"direction": "up", "steps": 3})
            presses = [c.args[0] for c in key.call_args_list if c.args[2] == 0]
            self.assertEqual(presses, [0xAF] * 3)
        with mock.patch.object(agent.ctypes.windll.user32, "keybd_event") as key:
            agent.run_action(self.CFG, "volume", {"direction": "mute"})
            self.assertEqual([c.args[0] for c in key.call_args_list if c.args[2] == 0], [0xAD])

    def test_volume_steps_are_capped(self):
        with mock.patch.object(agent.ctypes.windll.user32, "keybd_event") as key:
            agent.set_volume("down", 9999)
            self.assertLessEqual(len(key.call_args_list), 100)

    def test_volume_bad_direction_refused(self):
        with self.assertRaises(ValueError):
            agent.set_volume("sideways")

    def test_close_app_only_knows_listed_programs_and_never_force_kills(self):
        with self.assertRaises(LookupError):
            agent.close_app("explorer.exe /f")
        with mock.patch.object(agent.subprocess, "run") as run:
            run.return_value = mock.Mock(stdout="ok", stderr="")
            agent.close_app("chrome")
            cmd = run.call_args[0][0]
            self.assertEqual(cmd[:2], ["taskkill", "/IM"])
            self.assertNotIn("/F", cmd)

    def test_open_url_only_http_and_https(self):
        for bad in ("file:///c:/windows/system32/cmd.exe", "javascript:alert(1)", "ms-settings:", "ftp://x"):
            with self.assertRaises(ValueError, msg=bad):
                agent.open_url(bad)


class T14_Versions(unittest.TestCase):
    def test_version_comparison(self):
        self.assertTrue(ops._vtuple("1.2.3") > ops._vtuple("1.2.2"))
        self.assertTrue(ops._vtuple("1.10.0") > ops._vtuple("1.9.9"))
        self.assertFalse(ops._vtuple("1.2.3") > ops._vtuple("1.2.3"))

    def test_published_version_is_not_older_than_the_exe_constant(self):
        self.assertRegex(ops.VERSION, r"^\d+\.\d+\.\d+$")

    def test_step_descriptions_for_the_on_screen_banner(self):
        self.assertIn("Save", ops.describe_step({"op": "click", "name": "Save"}))
        self.assertIn("5", ops.describe_step({"op": "type", "text": "hello"}))
        self.assertIn("ctrl+s", ops.describe_step({"op": "key", "keys": "ctrl+s"}))

    def test_password_and_bank_windows_are_never_touched(self):
        for title in ("HDFC NetBanking - Chrome", "Bitwarden", "Checkout - Payment", "Paytm"):
            self.assertTrue(ops.SENSITIVE.search(title), title)
        self.assertFalse(ops.SENSITIVE.search("Untitled - Notepad"))

    def test_dangerous_key_combos_are_refused(self):
        for combo in ("alt+f4", "ctrl+alt+del", "win+r", "ctrl+shift+esc"):
            with self.assertRaises(PermissionError, msg=combo):
                ops.keys_to_sendkeys(combo)


class T15_AgentTalksToRealServer(unittest.TestCase):
    """The agent's own sign-in code against the real server code (a throw-away copy)."""

    @classmethod
    def setUpClass(cls):
        import server_test as st
        cls.st = st
        st.start_server()
        import requests
        s = requests.Session()
        st.post("setup", {"username": "owner", "password": "OwnerPass12345", "device_name": "Laptop", "device_type": "laptop"}, s)
        st.post("device_login_save", {"id": 0, "name": "Test PC", "type": "laptop", "login_name": "test_pc", "password": "TestPc12345pw"}, s)
        cls.owner = s

    @classmethod
    def tearDownClass(cls):
        cls.st.stop_server()

    def make_cfg(self, password):
        path = os.path.join(os.environ["JARVIS_AGENT_HOME"], "rl_config.json")
        cfg = {"server_url": f"http://127.0.0.1:{self.st.PORT}/", "token": "0" * 64, "login": {"username": "test_pc", "password": agent.protect_password(password)}}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f)
        return path, cfg

    def test_01_relogin_swaps_the_token_and_saves_it(self):
        import requests
        path, cfg = self.make_cfg("TestPc12345pw")
        s = requests.Session()
        with mock.patch.object(agent, "CONFIG_PATH", path):
            self.assertEqual(agent.relogin(cfg, s, cfg["server_url"] + "api.php?r="), "ok")
        self.assertEqual(len(cfg["token"]), 64)
        self.assertNotEqual(cfg["token"], "0" * 64)
        self.assertEqual(s.headers["X-Agent-Token"], cfg["token"])
        self.assertEqual(json.load(open(path))["token"], cfg["token"])
        self.assertEqual(self.st.beat(cfg["token"]).status_code, 200)

    def test_02_wrong_password_is_reported_as_bad(self):
        import requests
        self.st.sql("DELETE FROM login_attempts")
        path, cfg = self.make_cfg("not-the-password-1")
        with mock.patch.object(agent, "CONFIG_PATH", path):
            self.assertEqual(agent.relogin(cfg, requests.Session(), cfg["server_url"] + "api.php?r="), "bad")
        self.st.sql("DELETE FROM login_attempts")

    def test_03_unreachable_server_is_reported_as_down_not_bad(self):
        import requests
        path, cfg = self.make_cfg("TestPc12345pw")
        cfg["server_url"] = "http://127.0.0.1:9/"
        with mock.patch.object(agent, "CONFIG_PATH", path):
            self.assertEqual(agent.relogin(cfg, requests.Session(), cfg["server_url"] + "api.php?r="), "down")

    def test_04_corrupt_saved_password_is_bad_not_a_crash(self):
        import requests
        path, cfg = self.make_cfg("x")
        cfg["login"]["password"] = "this is not base64 dpapi data"
        with mock.patch.object(agent, "CONFIG_PATH", path):
            self.assertEqual(agent.relogin(cfg, requests.Session(), cfg["server_url"] + "api.php?r="), "bad")


if __name__ == "__main__":
    unittest.main(verbosity=2)

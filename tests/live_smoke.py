"""Live smoke test: checks the PUBLIC face of https://ai.udaypurgroup.in without any password. Safe to run any time.

Run:  agent\venv\Scripts\python.exe tests\live_smoke.py
Uses only 1 wrong-password attempt (the server locks an IP after 8 in 15 minutes).
"""
import time
import unittest

import requests

SITE = "https://ai.udaypurgroup.in/"
API = SITE + "api.php?r="
H = {"X-Requested-With": "jarvis"}


class LiveSmoke(unittest.TestCase):
    def test_01_site_answers_over_https_and_fast(self):
        t0 = time.time()
        r = requests.get(API + "state", headers=H, timeout=20)
        self.assertEqual(r.status_code, 200)
        self.assertLess(time.time() - t0, 1.5)
        self.assertIn("no-store", r.headers.get("Cache-Control", ""))

    def test_02_http_is_sent_to_https(self):
        r = requests.get("http://ai.udaypurgroup.in/", allow_redirects=False, timeout=20)
        self.assertIn(r.status_code, (301, 302, 307, 308))
        self.assertTrue(r.headers.get("Location", "").startswith("https://"))

    def test_03_security_headers_present(self):
        h = requests.get(SITE, timeout=20).headers
        for name in ("Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Strict-Transport-Security", "Referrer-Policy"):
            self.assertIn(name, h, name)

    def test_04_secret_and_internal_files_are_not_public(self):
        for path in ("config.php", "config.sample.php", "data/llm_errors.log", "data/device_audit.log", "data/app.sqlite", ".git/config", "README.md"):
            r = requests.get(SITE + path, timeout=20)
            self.assertIn(r.status_code, (403, 404), f"{path} -> {r.status_code}")
            self.assertNotIn("api_key", r.text.lower(), path)

    def test_05_app_files_and_database_are_not_under_the_web_root(self):
        for path in ("downloads/JarvisAgent.exe", "jarvis_data/app.sqlite", "app.sqlite", "med.sqlite"):
            self.assertIn(requests.get(SITE + path, timeout=20).status_code, (403, 404), path)

    def test_06_removed_backdoor_files_stay_removed(self):
        for url in ("https://udaypurgroup.in/g.php", "https://udaypurgroup.in/api/test-db.php", "https://udaypurgroup.in/a.php", "https://udaypurgroup.in/dh9u7.php", SITE + "file5.php"):
            r = requests.get(url, timeout=20)
            self.assertNotIn("<?php", r.text, url)
            self.assertNotIn("google-site-verification", r.text.lower(), url)

    def test_07_agent_routes_need_a_token(self):
        for route in ("agent_poll", "agent_result", "app_update", "app_update_file"):
            self.assertEqual(requests.get(API + route, headers=H, timeout=20).status_code, 401, route)

    def test_08_owner_routes_need_a_login(self):
        for route in ("devices", "chat_poll", "downloads", "device_logins", "commands"):
            self.assertEqual(requests.get(API + route, headers=H, timeout=20).status_code, 401, route)
        self.assertEqual(requests.post(API + "chat", json={"text": "hi"}, headers=H, timeout=20).status_code, 401)

    def test_09_wrong_device_password_is_refused_with_a_neutral_message(self):
        r = requests.post(API + "agent_login", json={"username": "smoke_test_nobody", "password": "wrong-password-1"}, headers=H, timeout=20)
        self.assertEqual(r.status_code, 401)
        self.assertNotIn("token", r.text)

    def test_10_setup_is_closed(self):
        r = requests.post(API + "setup", json={"username": "intruder", "password": "IntruderPass12345"}, headers=H, timeout=20)
        self.assertIn(r.status_code, (400, 403))

    def test_11_new_agent_code_is_live(self):
        r = requests.post(API + "agent_login", json={}, headers=H, timeout=20)
        self.assertNotEqual(r.status_code, 404, "agent_login is not deployed")


if __name__ == "__main__":
    unittest.main(verbosity=2)

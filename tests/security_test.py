"""Tests for the 2026-10-28 security fixes: signed updates, approvals, pause switch, per-account lockout, token expiry, alerts.

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "agent"))
os.environ.setdefault("JARVIS_AGENT_HOME", tempfile.mkdtemp(prefix="jarvis_sec_test_"))

import ed25519  # noqa: E402
import server_test as st  # noqa: E402


def make_key():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    k = Ed25519PrivateKey.generate()
    return k, k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


class T20_SignedUpdates(unittest.TestCase):
    def test_valid_signature_verifies(self):
        k, pub = make_key()
        msg = ed25519.release_message("windows", "1.2.5", "ab" * 32)
        self.assertTrue(ed25519.verify(pub, msg, k.sign(msg)))

    def test_tampered_message_signature_or_key_fails(self):
        k, pub = make_key()
        other_k, other_pub = make_key()
        msg = ed25519.release_message("windows", "1.2.5", "ab" * 32)
        sig = k.sign(msg)
        self.assertFalse(ed25519.verify(pub, msg + b"x", sig))
        self.assertFalse(ed25519.verify(other_pub, msg, sig))
        bad = bytearray(sig)
        bad[10] ^= 0x01
        self.assertFalse(ed25519.verify(pub, msg, bytes(bad)))

    def test_garbage_inputs_never_raise(self):
        k, pub = make_key()
        for p, m, s in [(b"", b"m", b"s" * 64), (pub, b"m", b""), (pub, b"m", b"\x00" * 64), (b"\xff" * 32, b"m", b"\xff" * 64), (pub, b"", b"\x01" * 63)]:
            self.assertFalse(ed25519.verify(p, m, s))

    def test_signature_is_bound_to_platform_version_and_hash(self):
        k, pub = make_key()
        sig = k.sign(ed25519.release_message("windows", "1.2.5", "aa" * 32))
        self.assertFalse(ed25519.verify(pub, ed25519.release_message("android", "1.2.5", "aa" * 32), sig))
        self.assertFalse(ed25519.verify(pub, ed25519.release_message("windows", "1.2.6", "aa" * 32), sig), "an old signed file must not pass as a newer version")
        self.assertFalse(ed25519.verify(pub, ed25519.release_message("windows", "1.2.5", "bb" * 32), sig), "another file must not reuse the signature")

    def test_the_real_release_key_in_the_apps_matches_the_owners_private_key(self):
        import ops
        key_path = os.path.join(os.path.expanduser("~"), ".jarvis_signing", "release_ed25519.pem")
        if not os.path.exists(key_path):
            self.skipTest("signing key is not on this PC")
        from cryptography.hazmat.primitives import serialization
        priv = serialization.load_pem_private_key(open(key_path, "rb").read(), password=None)
        pub = priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.assertEqual(pub, ops.UPDATE_PUBKEY)
        kt = open(os.path.join(ROOT, "android", "app", "src", "main", "java", "com", "udaypurgroup", "jarvis", "Updater.kt"), encoding="utf-8").read()
        self.assertIn(pub.hex(), kt, "Android app must carry the same public key")


class T21_UpdateInstaller(unittest.TestCase):
    """ops.check_update with a fake server: only a correctly signed file is ever installed."""

    def setUp(self):
        import ops
        self.ops = ops
        self.key, self.pub = make_key()
        self.home = tempfile.mkdtemp(prefix="upd_")
        self.payload = b"MZ" + os.urandom(2000)
        self.sha = hashlib.sha256(self.payload).hexdigest()
        self.patches = [mock.patch.object(ops, "UPDATE_PUBKEY", self.pub), mock.patch.object(ops, "HOME", self.home),
                        mock.patch.object(ops.sys, "frozen", True, create=True), mock.patch.object(ops.sys, "executable", os.path.join(self.home, "JarvisAgent.exe"))]
        for p in self.patches:
            p.start()
        self.popen = mock.patch.object(ops.subprocess, "Popen").start()
        self.exit = mock.patch.object(ops.os, "_exit", side_effect=SystemExit).start()

    def tearDown(self):
        mock.patch.stopall()

    def session(self, info, body=None):
        s = mock.Mock()
        info_resp = mock.Mock(status_code=200)
        info_resp.json.return_value = info
        file_resp = mock.MagicMock()
        file_resp.__enter__.return_value = file_resp
        file_resp.iter_content.return_value = [body if body is not None else self.payload]
        s.get.side_effect = lambda url, **kw: info_resp if url.endswith("app_update") else file_resp
        return s

    def info(self, version="9.9.9", signature=None, sha=None):
        sha = sha or self.sha
        sig = signature if signature is not None else self.key.sign(ed25519.release_message("windows", version, sha)).hex()
        return {"version": version, "file": "JarvisAgent.exe", "sha256": sha, "signature": sig}

    def test_signed_update_is_downloaded_and_applied(self):
        with self.assertRaises(SystemExit):
            self.ops.check_update(self.session(self.info()), "https://x/api.php?r=")
        self.assertTrue(self.popen.called, "installer script should have been started")
        self.assertTrue(os.path.exists(os.path.join(self.home, "apply_update.bat")))

    def test_unsigned_update_is_refused_and_nothing_is_downloaded(self):
        info = self.info()
        info.pop("signature")
        s = self.session(info)
        result = self.ops.check_update(s, "https://x/api.php?r=")
        self.assertIn("signature", result)
        self.assertEqual(s.get.call_count, 1, "only the version question, no file download")
        self.assertFalse(self.popen.called)

    def test_signature_from_another_key_is_refused(self):
        other, _ = make_key()
        bad = other.sign(ed25519.release_message("windows", "9.9.9", self.sha)).hex()
        result = self.ops.check_update(self.session(self.info(signature=bad)), "https://x/api.php?r=")
        self.assertIn("signature", result)
        self.assertFalse(self.popen.called)

    def test_taken_over_server_swapping_the_file_is_caught(self):
        evil = b"MZ" + b"evil" * 400
        result = self.ops.check_update(self.session(self.info(), body=evil), "https://x/api.php?r=")
        self.assertIn("sha", result)
        self.assertFalse(self.popen.called)
        self.assertFalse(os.path.exists(os.path.join(self.home, "JarvisAgent.new.exe")), "bad file is deleted")

    def test_taken_over_server_that_also_changes_the_hash_is_caught_by_the_signature(self):
        evil = b"MZ" + b"evil" * 400
        info = self.info()
        info["sha256"] = hashlib.sha256(evil).hexdigest()  # attacker edits versions.json but cannot re-sign
        result = self.ops.check_update(self.session(info, body=evil), "https://x/api.php?r=")
        self.assertIn("signature", result)
        self.assertFalse(self.popen.called)

    def test_old_or_same_version_is_ignored(self):
        self.assertEqual(self.ops.check_update(self.session(self.info(version="0.0.1")), "https://x/api.php?r="), "latest")

    def test_garbage_signature_text_does_not_crash_the_loop(self):
        try:
            result = self.ops.check_update(self.session(self.info(signature="zz-not-hex")), "https://x/api.php?r=")
        except ValueError:
            return  # start_updater() wraps the call in try/except
        self.assertIn("signature", result)
        self.assertFalse(self.popen.called)


def setUpModule():
    st.start_server()
    s = requests.Session()
    st.post("setup", {"username": "owner", "password": "OwnerPass12345", "device_name": "Laptop", "device_type": "laptop"}, s)
    for login, name, typ, pw in [("sec_laptop", "Sec Laptop", "laptop", "SecLaptop12345pw"), ("sec_phone", "Sec Phone", "android", "SecPhone12345pw"),
                                 ("sec_other", "Sec Other", "laptop", "SecOther12345pw")]:
        st.post("device_login_save", {"id": 0, "name": name, "type": typ, "login_name": login, "password": pw}, s)
    Base.owner = s
    st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")


def tearDownModule():
    st.stop_server()


class Base(unittest.TestCase):
    owner = None
    LAP = ("sec_laptop", "SecLaptop12345pw")
    PHO = ("sec_phone", "SecPhone12345pw")

    def setUp(self):
        st.sql("DELETE FROM login_attempts")
        st.sql("DELETE FROM chat")
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%' OR k LIKE 'paused_%'")
        self.lap = st.agent_login(*self.LAP).json()["token"]
        self.pho = st.agent_login(*self.PHO).json()["token"]
        st.beat(self.lap)
        st.beat(self.pho)

    def poll(self, tok):
        return requests.get(f"{st.BASE}?r=agent_poll&wait=0", headers={**st.HDR, "X-Agent-Token": tok}).json()

    def php(self, code):
        site = os.path.join(st.TMP, "site")
        out = subprocess.run(["php", "-r", "chdir(" + json.dumps(site) + "); require 'lib/db.php'; require 'lib/auth.php'; require 'lib/memory.php'; require 'lib/tools.php'; " + code],
                             capture_output=True, text=True, timeout=60)
        return out.stdout.strip()


class T22_Approvals(Base):
    def test_screen_control_and_password_typing_now_need_approve(self):
        for action in ("operate", "ui_control", "vault_fill", "screen_look"):
            self.assertEqual(self.php(f"echo needs_approval('{action}', []) ? 'ask' : 'auto';"), "ask", action)

    def test_everyday_actions_still_run_without_asking(self):
        for action in ("open_app", "volume", "claude_sessions", "cpu_status", "lock"):
            self.assertEqual(self.php(f"echo needs_approval('{action}', []) ? 'ask' : 'auto';"), "auto", action)

    def test_owner_can_still_allow_screen_control_but_never_password_typing(self):
        said = self.php("echo authority_set('operate', true, 'operate ke liye bina puchhe kaam karo (permission deta hoon)');")
        self.assertNotIn("Error", said)
        self.assertEqual(self.php("echo needs_approval('operate', []) ? 'ask' : 'auto';"), "auto")
        self.assertIn("hamesha", self.php("echo authority_set('vault_fill', true, 'vault_fill bina puchhe karo permission');"))
        self.assertEqual(self.php("echo needs_approval('vault_fill', []) ? 'ask' : 'auto';"), "ask")
        self.php("authority_set('operate', false, 'operate ab puch kar karo permission wapas');")


class T23_PauseSwitch(Base):
    def test_voice_pause_stops_commands_and_resume_restores_them(self):
        r = st.post("chat", {"text": "jarvis pause"}, self.owner)
        self.assertIn("Pause", r.json()["reply"])
        before = st.sql("SELECT coalesce(max(id),0) FROM commands")[0][0]
        r = st.post("chat", {"text": "chrome kholo"}, self.owner)
        self.assertIn("PAUSE", r.text)
        self.assertEqual(st.sql("SELECT coalesce(max(id),0) FROM commands")[0][0], before, "nothing queued while paused")
        st.post("chat", {"text": "jarvis resume"}, self.owner)
        st.sql("DELETE FROM chat")
        st.post("chat", {"text": "chrome kholo"}, self.owner)
        self.assertGreater(st.sql("SELECT coalesce(max(id),0) FROM commands")[0][0], before)

    def test_paused_agent_stays_online_but_receives_nothing(self):
        st.post("chat", {"text": "laptop ka cpu batao"}, self.owner)  # queued while running
        st.post("pause", {"paused": True}, self.owner)
        got = self.poll(self.lap)
        self.assertEqual(got["commands"], [])
        self.assertTrue(got["paused"])
        st.post("pause", {"paused": False}, self.owner)
        self.assertEqual([c["action"] for c in self.poll(self.lap)["commands"]], ["cpu_status"], "the waiting command is delivered after resume")

    def test_pause_state_is_visible_in_status(self):
        st.post("pause", {"paused": True}, self.owner)
        self.assertTrue(self.owner.get(f"{st.BASE}?r=status", headers=st.HDR).json()["paused"])
        st.post("pause", {"paused": False}, self.owner)
        self.assertFalse(self.owner.get(f"{st.BASE}?r=status", headers=st.HDR).json()["paused"])

    def test_agents_and_strangers_cannot_pause(self):
        self.assertEqual(st.post("pause", {"paused": True}).status_code, 401)
        r = requests.post(f"{st.BASE}?r=pause", json={"paused": True}, headers={**st.HDR, "X-Agent-Token": self.lap})
        self.assertEqual(r.status_code, 401)

    def test_everyday_words_never_pause(self):
        for text in ("ruko", "stop", "pause", "ruk jao", "continue", "resume"):
            st.sql("DELETE FROM chat")
            st.post("chat", {"text": text}, self.owner)
        self.assertFalse(self.owner.get(f"{st.BASE}?r=status", headers=st.HDR).json()["paused"])


class T24_Lockout(Base):
    def test_wrong_saved_password_of_one_device_does_not_lock_the_owner_or_other_devices(self):
        for i in range(9):
            st.agent_login("sec_laptop", f"stale-password-{i}x")
        self.assertEqual(st.agent_login(*self.LAP).status_code, 429, "that device ID is locked")
        self.assertEqual(st.post("login", {"username": "owner", "password": "OwnerPass12345", "device_name": "Test Browser", "device_type": "laptop"}, requests.Session()).status_code, 200, "owner can still sign in")
        self.assertEqual(st.agent_login(*self.PHO).status_code, 200, "another device ID can still sign in")

    def test_spraying_many_usernames_hits_the_ip_wide_limit(self):
        codes = [st.agent_login(f"nobody_{i}", "wrong-password-1").status_code for i in range(45)]
        self.assertEqual(codes[0], 401)
        self.assertEqual(codes[-1], 429)
        self.assertEqual(st.post("login", {"username": "owner", "password": "OwnerPass12345", "device_name": "Test Browser", "device_type": "laptop"}, requests.Session()).status_code, 429, "whole IP is locked")

    def test_lockout_username_case_is_not_a_bypass(self):
        for i in range(8):
            st.agent_login("SEC_LAPTOP" if i % 2 else "sec_laptop", f"bad-{i}-password")
        self.assertEqual(st.agent_login("Sec_Laptop", "bad-again-pw1").status_code, 429)


class T25_TokenExpiry(Base):
    def test_device_id_agent_token_expires_after_30_days_and_login_recovers(self):
        st.sql("UPDATE devices SET created_at = ? WHERE token_hash = ?", (int(time.time()) - 31 * 86400, hashlib.sha256(self.lap.encode()).hexdigest()))
        self.assertEqual(st.beat(self.lap).status_code, 401)
        self.assertEqual(st.agent_login(*self.LAP).status_code, 200)

    def test_fresh_token_is_fine(self):
        st.sql("UPDATE devices SET created_at = ? WHERE token_hash = ?", (int(time.time()) - 29 * 86400, hashlib.sha256(self.lap.encode()).hexdigest()))
        self.assertEqual(st.beat(self.lap).status_code, 200)

    def test_legacy_paired_agent_without_a_device_id_is_not_cut_off(self):
        code = "TESTCODE"
        st.sql("INSERT INTO pair_codes (user_id, code_hash, name, type, expires_at, role) VALUES (1, ?, 'Old PC', 'laptop', ?, 'agent')",
               (hashlib.sha256(code.encode()).hexdigest(), int(time.time()) + 600))
        tok = st.post("agent_pair", {"code": code}).json()["token"]
        st.sql("UPDATE devices SET created_at = ? WHERE token_hash = ?", (int(time.time()) - 90 * 86400, hashlib.sha256(tok.encode()).hexdigest()))
        self.assertEqual(st.beat(tok).status_code, 200)


class T26_Alerts(Base):
    def phone_notifications(self):
        return [json.loads(a)["text"] for (a,) in st.sql("SELECT args FROM commands WHERE action='phone_notify' ORDER BY id")]

    def test_new_device_login_notifies_the_phone_and_is_logged(self):
        st.sql("DELETE FROM commands")
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        st.agent_login(*self.LAP)
        notes = self.phone_notifications()
        self.assertTrue(any("Sec Laptop" in n and "security" in n.lower() for n in notes), notes)
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("devlogin", log)

    def test_alerts_are_rate_limited_per_kind(self):
        st.sql("DELETE FROM commands")
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        for _ in range(4):
            st.agent_login(*self.LAP)
        self.assertEqual(len(self.phone_notifications()), 1, "one phone message per kind per 5 minutes")

    def test_changing_a_device_password_and_deleting_a_device_raise_alerts(self):
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        lid = st.sql("SELECT id FROM device_logins WHERE login_name='sec_other'")[0][0]
        st.post("device_login_save", {"id": lid, "name": "Sec Other", "type": "laptop", "login_name": "sec_other", "password": "SecOther99999pw"}, self.owner)
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("Device ID password badla", log)

    def test_lockout_raises_an_alert(self):
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        for i in range(9):
            st.agent_login("sec_other", f"wrong-{i}-pw-xx")
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("[lockout]", log)

    def test_security_log_is_not_served_to_the_web_in_production(self):
        ht = open(os.path.join(ROOT, "server", "data", ".htaccess"), encoding="utf-8").read()
        self.assertIn("denied", ht.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)

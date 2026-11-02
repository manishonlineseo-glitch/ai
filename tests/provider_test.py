"""AI-detection provider (Sapling) tests: key handling, honest provider states, real-request format, every failure mode, multi-detector gates.

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py
Sapling is replaced by a local stub that follows the official API description (POST /api/v1/aidetect, Bearer key, text, score 0-1, ...).
A request to the real Sapling needs the owner's own key and is a separate, manual check ("Test connection" on the Content page).
"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import server_test as st  # noqa: E402
from content_test import GOOD, GOOD_BODY, cli, formatted  # noqa: E402

PORT = 8196
KEY = "AbCdEfGh12345678AbCdEfGh12345678"  # 32 characters, like a real Sapling key (this one is made up)
STUB = {"calls": [], "mode": "ok"}
OWNER = None

LONG_BODY = GOOD_BODY + "\n\n" + "\n\n".join(["Banks check every payment before they say yes to a shop, and the shop waits for the answer at the counter. " * 4] * 3)


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        STUB["calls"].append({"path": self.path, "auth": self.headers.get("Authorization", ""), "ctype": self.headers.get("Content-Type", ""), "raw": raw})
        mode = STUB["mode"]
        if mode in ("401", "403", "429", "500"):
            self.send_response(int(mode))
            self.end_headers()
            return
        try:
            body = json.loads(raw)
        except ValueError:
            body = {}
        text = body.get("text", "")
        score = 0.31 if "HIGHAI" in text else 0.081 if "BORDER081" in text else 0.08 if "BORDER08" in text else 0.03
        out = {"score": score, "verdict": "ai" if score > 0.5 else "human", "ai_fraction": 0.1, "version": "2026-test", "segments": [{"start": 0, "end": 40, "text": text[:40], "score": 0.9}],
               "sentence_scores": [], "low_confidence": False}
        if mode == "garbage":
            payload = b"<html>not json</html>"
        elif mode == "noscore":
            payload = json.dumps({"verdict": "human"}).encode()
        else:
            if mode == "lowconf":
                out["low_confidence"] = True
                out["low_confidence_reasons"] = ["short text"]
            payload = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)


def setUpModule():
    global OWNER
    srv = HTTPServer(("127.0.0.1", PORT), Stub)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    setUpModule.srv = srv
    st.EXTRA_CONFIG = {"sapling_url": f"http://127.0.0.1:{PORT}/api/v1/aidetect"}
    st.start_server()
    OWNER = requests.Session()
    st.post("setup", {"username": "owner", "password": "OwnerPass12345", "device_name": "Laptop", "device_type": "laptop"}, OWNER)


def tearDownModule():
    st.stop_server()
    st.EXTRA_CONFIG = {}
    setUpModule.srv.shutdown()


def post(route, body):
    return st.post(route, body, OWNER)


def get(route):
    return OWNER.get(f"{st.BASE}?r={route}", headers=st.HDR)


def make_article(language="English", body=LONG_BODY):
    doc = {**GOOD, "body": body}
    cli({"op": "task", "title": "Content: payment failed", "details": f"Brand: Wisi Pay\nLanguage: {language}\nAccent: American\nTopic: test topic here", "drafts": [formatted(doc)]})
    return st.sql("SELECT max(id) FROM tasks")[0][0]


def gates(tid):
    return get(f"content_gate_get&id={tid}").json()["gates"]


def key_file():
    return os.path.join(os.path.dirname(st.DB), "provider_keys.json")


def set_key(key=KEY):
    return post("content_provider_key", {"provider": "sapling", "key": key})


def consent(on=True):
    post("content_consent", {"allowed": on})


class Base(unittest.TestCase):
    def setUp(self):
        STUB["calls"].clear()
        STUB["mode"] = "ok"
        post("content_provider_key", {"provider": "sapling", "key": ""})
        consent(True)


class T90_Auth(Base):
    def test_provider_routes_need_the_owner(self):
        self.assertEqual(requests.get(f"{st.BASE}?r=content_provider", headers=st.HDR).status_code, 401)
        for route in ("content_ai_run", "content_provider_key", "content_provider_test"):
            self.assertEqual(st.post(route, {"id": 1, "provider": "sapling", "key": KEY}).status_code, 401, route)

    def test_other_owners_articles_cannot_be_checked(self):
        st.sql("INSERT OR IGNORE INTO users (id, username, pass_hash, created_at) VALUES (66, 'other3', 'x', 1)")
        st.sql("INSERT INTO tasks (id, user_id, title, created_at, category, status, details, assignee, updated_at) VALUES (9300, 66, 'Not yours', 1, 'content', 'review', '', 'jarvis', 1)")
        set_key()
        self.assertEqual(post("content_ai_run", {"id": 9300}).status_code, 404)
        self.assertEqual(STUB["calls"], [])


class T91_KeyHandling(Base):
    def test_a_valid_key_is_saved_outside_the_web_root_and_never_returned(self):
        self.assertEqual(set_key().status_code, 200)
        self.assertTrue(os.path.exists(key_file()))
        self.assertNotIn(os.path.join(st.TMP, "site"), key_file())
        r = get("content_provider")
        self.assertNotIn(KEY, r.text)
        j = r.json()["sapling"]
        self.assertEqual((j["configured"], j["key_hint"]), (True, "…5678"))

    def test_bad_keys_are_refused_and_nothing_is_saved(self):
        for bad in ("short", "x" * 33, "AbCdEfGh12345678AbCdEfGh1234567!", "<script>alert(1)</script>"):
            self.assertEqual(set_key(bad).status_code, 400, bad)
        self.assertFalse(get("content_provider").json()["sapling"]["configured"])

    def test_unknown_provider_is_refused(self):
        self.assertEqual(post("content_provider_key", {"provider": "evilcorp", "key": KEY}).status_code, 400)
        self.assertEqual(post("content_provider_test", {"provider": "evilcorp"}).status_code, 400)

    def test_removing_the_key_removes_it(self):
        set_key()
        post("content_provider_key", {"provider": "sapling", "key": ""})
        self.assertFalse(get("content_provider").json()["sapling"]["configured"])
        self.assertNotIn(KEY, open(key_file(), encoding="utf-8").read() if os.path.exists(key_file()) else "")

    def test_saving_a_key_is_logged_without_the_key(self):
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        set_key()
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("[provider_key]", log)
        self.assertNotIn(KEY, log)

    def test_key_file_is_not_a_web_path(self):
        site = os.path.join(st.TMP, "site")
        self.assertFalse(os.path.exists(os.path.join(site, "provider_keys.json")))
        self.assertFalse(os.path.exists(os.path.join(site, "data", "provider_keys.json")))


class T92_HonestStates(Base):
    def state(self):
        return get("content_provider").json()["providers"]["ai_detection"]["state"]

    def test_no_key_means_configuration_required(self):
        self.assertIn("CONFIGURATION REQUIRED", self.state())

    def test_a_saved_key_alone_is_not_called_verified(self):
        set_key()
        s = self.state()
        self.assertIn("CONFIGURED", s)
        self.assertNotIn("CONNECTED & VERIFIED", s)

    def test_only_a_real_answer_makes_it_connected_and_verified(self):
        set_key()
        r = post("content_provider_test", {"provider": "sapling"}).json()
        self.assertTrue(r["ok"], r)
        self.assertIn("CONNECTED & VERIFIED", self.state())
        self.assertGreater(get("content_provider").json()["sapling"]["verified_at"], 0)

    def test_failed_connection_tests_never_verify(self):
        set_key()
        for mode in ("401", "429", "500", "garbage", "noscore"):
            STUB["mode"] = mode
            r = post("content_provider_test", {"provider": "sapling"}).json()
            self.assertFalse(r["ok"], mode)
            self.assertNotIn("CONNECTED & VERIFIED", self.state(), mode)

    def test_connection_test_uses_our_own_sample_not_the_owners_article(self):
        set_key()
        consent(False)  # no permission needed: nothing of the owner's is sent
        post("content_provider_test", {"provider": "sapling"})
        self.assertEqual(len(STUB["calls"]), 1)
        self.assertIn("village market", STUB["calls"][0]["raw"])

    def test_plagiarism_is_honestly_not_connected(self):
        s = get("content_provider").json()["providers"]["plagiarism"]["state"]
        self.assertIn("UNAVAILABLE", s)

    def test_connection_test_without_a_key_says_so_and_sends_nothing(self):
        r = post("content_provider_test", {"provider": "sapling"}).json()
        self.assertFalse(r["ok"])
        self.assertIn("key", r["message"])
        self.assertEqual(STUB["calls"], [])


class T93_RealRequestFormat(Base):
    def test_request_follows_the_official_api(self):
        set_key()
        tid = make_article()
        post("content_ai_run", {"id": tid})
        c = STUB["calls"][0]
        self.assertEqual(c["path"], "/api/v1/aidetect")
        self.assertEqual(c["auth"], "Bearer " + KEY)
        self.assertIn("application/json", c["ctype"])
        body = json.loads(c["raw"])
        self.assertEqual((body["zero_retention"], body["sent_scores"]), (True, True))
        self.assertIn("text", body)
        self.assertNotIn("texts", body)
        self.assertNotIn(KEY, c["raw"], "the key travels in the header only")

    def test_markdown_is_stripped_before_sending(self):
        set_key()
        tid = make_article()
        post("content_ai_run", {"id": tid})
        text = json.loads(STUB["calls"][0]["raw"])["text"]
        self.assertNotIn("![", text)
        self.assertNotIn("](", text)
        self.assertNotIn("## ", text)


class T94_Checks(Base):
    def setUp(self):
        super().setUp()
        set_key()
        self.tid = make_article()

    def run_ai(self, tid=None):
        r = post("content_ai_run", {"id": tid or self.tid})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_low_score_passes_and_is_stored_as_a_provider_result(self):
        r = self.run_ai()
        self.assertEqual((r["status"], r["score"]), ("PASS", 3.0))
        row = st.sql("SELECT provider, kind, score, status FROM content_checks WHERE task_id = ? AND check_type = 'ai_detection'", (self.tid,))[0]
        self.assertEqual(row, ("Sapling AI Detector API v1", "provider", 3.0, "PASS"))

    def test_boundary_8_passes_and_8_1_fails(self):
        self.assertEqual(self.run_ai(make_article(body=LONG_BODY + "\n\nBORDER08 marker."))["status"], "PASS")
        t2 = make_article(body=LONG_BODY + "\n\nBORDER081 marker.")
        r = self.run_ai(t2)
        self.assertEqual((r["status"], r["score"]), ("FAIL", 8.1))

    def test_high_ai_score_fails_the_gate(self):
        tid = make_article(body=LONG_BODY + "\n\nHIGHAI marker.")
        self.assertEqual(self.run_ai(tid)["score"], 31.0)
        self.assertEqual(gates(tid)["gates"]["ai_detection"]["status"], "FAIL")
        self.assertEqual(gates(tid)["status"], "REJECTED")

    def test_flagged_passages_and_verdict_are_kept(self):
        self.run_ai()
        detail = json.loads(st.sql("SELECT detail FROM content_checks WHERE task_id = ? AND check_type = 'ai_detection'", (self.tid,))[0][0])
        self.assertEqual(detail["verdict"], "human")
        self.assertEqual(detail["flagged"][0]["start"], 0)
        self.assertIn("not proof of human authorship", detail["note"])

    def test_without_permission_nothing_is_sent(self):
        consent(False)
        r = self.run_ai()
        self.assertEqual(r["status"], "NOT VERIFIED")
        self.assertIn("ijazat", r["error"])
        self.assertEqual(STUB["calls"], [])

    def test_unsupported_languages_are_never_checked_or_verified(self):
        for lang in ("Hindi", "Hinglish", "Tamil", "Arabic"):
            STUB["calls"].clear()
            tid = make_article(language=lang)
            r = self.run_ai(tid)
            self.assertEqual(r["status"], "NOT VERIFIED", lang)
            self.assertIn("support nahi", r["error"])
            self.assertEqual(STUB["calls"], [], lang)

    def test_supported_languages_are_sent(self):
        for lang in ("French", "German", "Spanish"):
            STUB["calls"].clear()
            self.assertEqual(self.run_ai(make_article(language=lang))["status"], "PASS", lang)
            self.assertEqual(len(STUB["calls"]), 1)

    def test_short_text_is_not_checked(self):
        tid = make_article(body="Payment failed. A very short post that is far too small for a detector to judge fairly.")
        r = self.run_ai(tid)
        self.assertEqual(r["status"], "NOT VERIFIED")
        self.assertEqual(STUB["calls"], [])

    def test_low_confidence_results_are_not_evidence(self):
        STUB["mode"] = "lowconf"
        r = self.run_ai()
        self.assertEqual(r["status"], "NOT VERIFIED")
        self.assertIn("kam bharose", r["error"])
        self.assertEqual(gates(self.tid)["gates"]["ai_detection"]["status"], "NOT VERIFIED")

    def test_every_provider_failure_is_not_verified_never_a_score(self):
        for mode, word in (("401", "manzoor nahi"), ("403", "manzoor nahi"), ("429", "limit"), ("500", "sahi jawab nahi"), ("garbage", "sahi jawab nahi"), ("noscore", "sahi jawab nahi")):
            STUB["mode"] = mode
            tid = make_article()
            r = self.run_ai(tid)
            self.assertEqual((r["status"], r["score"]), ("NOT VERIFIED", None), mode)
            self.assertIn(word, r["error"], mode)
            self.assertEqual(gates(tid)["gates"]["ai_detection"]["status"], "NOT VERIFIED", mode)

    def test_no_key_is_configuration_required(self):
        post("content_provider_key", {"provider": "sapling", "key": ""})
        r = self.run_ai()
        self.assertEqual(r["status"], "NOT VERIFIED")
        self.assertIn("CONFIGURATION REQUIRED", r["error"])
        self.assertEqual(STUB["calls"], [])

    def test_the_key_never_lands_in_any_record(self):
        STUB["mode"] = "401"
        self.run_ai()
        STUB["mode"] = "ok"
        self.run_ai()
        blob = json.dumps(st.sql("SELECT detail, raw, provider FROM content_checks")) + json.dumps(st.sql("SELECT detail FROM content_audit")) + open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertNotIn(KEY, blob)

    def test_a_new_run_replaces_the_providers_older_result_for_the_same_version(self):
        STUB["mode"] = "500"
        self.run_ai()
        STUB["mode"] = "ok"
        self.run_ai()
        g = gates(self.tid)["gates"]["ai_detection"]
        self.assertEqual(g["status"], "PASS")
        self.assertEqual(len(g["results"]), 1)

    def test_a_new_version_must_be_checked_again(self):
        self.run_ai()
        post("content_save_version", {"id": self.tid, "body": LONG_BODY + "\n\nOne more honest sentence about banks.", "reason": "edit"})
        self.assertEqual(gates(self.tid)["gates"]["ai_detection"]["status"], "NOT VERIFIED")


class T95_SeveralDetectors(Base):
    def setUp(self):
        super().setUp()
        set_key()
        self.tid = make_article()

    def manual(self, provider, score, **kw):
        return post("content_evidence", {"id": self.tid, "type": "ai_detection", "provider": provider, "score": score, **kw})

    def test_two_detectors_are_listed_separately_and_never_averaged(self):
        post("content_ai_run", {"id": self.tid})  # Sapling 3.0
        self.manual("ZeroGPT", 5)
        g = gates(self.tid)["gates"]["ai_detection"]
        self.assertEqual(sorted(r["provider"] for r in g["results"]), ["Sapling AI Detector API v1", "ZeroGPT"])
        self.assertEqual(sorted(r["score"] for r in g["results"]), [3.0, 5.0])
        self.assertEqual(g["status"], "PASS")

    def test_one_failing_detector_fails_the_gate_even_if_another_passes(self):
        post("content_ai_run", {"id": self.tid})
        self.manual("ZeroGPT", 22)
        g = gates(self.tid)["gates"]["ai_detection"]
        self.assertEqual(g["status"], "FAIL")
        self.assertEqual((g["provider"], g["score"]), ("ZeroGPT", 22.0), "the failing result is the one shown as the reason")

    def test_a_detector_that_could_not_check_does_not_block_one_that_did(self):
        STUB["mode"] = "500"
        post("content_ai_run", {"id": self.tid})
        self.manual("ZeroGPT", 4)
        self.assertEqual(gates(self.tid)["gates"]["ai_detection"]["status"], "PASS")

    def test_nothing_usable_stays_not_verified(self):
        STUB["mode"] = "500"
        post("content_ai_run", {"id": self.tid})
        self.assertEqual(gates(self.tid)["gates"]["ai_detection"]["status"], "NOT VERIFIED")

    def test_provider_result_can_complete_the_approval_path(self):
        post("content_ai_run", {"id": self.tid})
        post("content_evidence", {"id": self.tid, "type": "grammar", "provider": "Grammarly", "score": 93})
        post("content_evidence", {"id": self.tid, "type": "plagiarism", "provider": "Copyleaks", "score": 0})
        post("content_sources_save", {"id": self.tid, "sources": [{"name": "RBI", "url": "https://www.rbi.org.in"}]})
        post("content_evidence", {"id": self.tid, "type": "factual", "confirmed": True})
        g = gates(self.tid)
        self.assertEqual((g["status"], g["can_approve"]), ("APPROVED", True))
        self.assertEqual(post("content_approve", {"id": self.tid, "step": "approve"}).status_code, 200)

    def test_same_gate_unusable_everywhere_blocks_evidence(self):
        post("content_evidence", {"id": self.tid, "type": "grammar", "provider": "Grammarly", "score": 93})
        post("content_evidence", {"id": self.tid, "type": "plagiarism", "provider": "Copyleaks", "score": 0})
        STUB["mode"] = "500"
        post("content_ai_run", {"id": self.tid})
        self.assertEqual(gates(self.tid)["gates"]["evidence"]["status"], "NOT VERIFIED")


class T96_Dashboard(Base):
    def test_dashboard_reports_the_providers_honestly(self):
        d = get("content_quality").json()["providers"]
        self.assertIn("CONFIGURATION REQUIRED", d["ai_detection"]["state"])
        set_key()
        post("content_provider_test", {"provider": "sapling"})
        self.assertIn("CONNECTED & VERIFIED", get("content_quality").json()["providers"]["ai_detection"]["state"])
        self.assertIn("Hindi/Hinglish: nahi", d["ai_detection"]["languages"])


class T97_PageScript(unittest.TestCase):
    def js(self):
        return open(os.path.join(os.path.dirname(HERE), "server", "assets", "app.js"), encoding="utf-8").read()

    def test_provider_settings_are_on_the_content_page(self):
        js = self.js()
        for must in ("function providerSettings", "providerSettings()", "content_provider_test", "content_ai_run", "Sapling se AI check"):
            self.assertIn(must, js)

    def test_the_key_field_hides_what_is_typed_and_is_cleared_after_saving(self):
        js = self.js()
        seg = js[js.index("function providerSettings"):js.index("function qualityDashboard")]
        self.assertIn("type: 'password'", seg)
        self.assertIn("autocomplete: 'off'", seg)
        self.assertIn("keyInput.value = ''", seg)
        self.assertNotIn("localStorage", seg)
        self.assertNotIn("innerHTML", seg)

    def test_each_detectors_result_is_listed_separately_in_the_gate(self):
        js = self.js()
        self.assertIn("g.gates[name].results.map", js)


if __name__ == "__main__":
    unittest.main(verbosity=2)

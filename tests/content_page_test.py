"""Content page tests: the routes behind the Content tab (new, list, get, check, rules editor) and the page script itself.

Run:  agent\\venv\\Scripts\\python.exe tests\\run_all.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import unittest

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import server_test as st  # noqa: E402

GOOD_BODY = open(os.path.join(HERE, "fixtures", "good_article.md"), encoding="utf-8").read()
OWNER = None


def setUpModule():
    global OWNER
    st.start_server()
    OWNER = requests.Session()
    st.post("setup", {"username": "owner", "password": "OwnerPass12345", "device_name": "Laptop", "device_type": "laptop"}, OWNER)


def tearDownModule():
    st.stop_server()


def get(route):
    return OWNER.get(f"{st.BASE}?r={route}", headers=st.HDR)


def post(route, body):
    return st.post(route, body, OWNER)


def reset_state():
    st.sql("DELETE FROM tasks")
    st.sql("DELETE FROM kv WHERE k LIKE 'paused_%' OR k LIKE 'content_result_%' OR k LIKE 'alert_last_%'")


class T40_PageNeedsLogin(unittest.TestCase):
    def test_every_content_route_refuses_strangers(self):
        for route in ("content_list", "content_get&id=1", "content_rules"):
            self.assertEqual(requests.get(f"{st.BASE}?r={route}", headers=st.HDR).status_code, 401, route)
        for route in ("content_new", "content_check", "content_rules_save"):
            self.assertEqual(st.post(route, {"topic": "x" * 20}).status_code, 401, route)

    def test_an_agent_token_cannot_use_the_page_routes(self):
        st.post("device_login_save", {"id": 0, "name": "PC", "type": "laptop", "login_name": "cp_pc", "password": "CpPc12345password"}, OWNER)
        tok = st.agent_login("cp_pc", "CpPc12345password").json()["token"]
        r = requests.post(f"{st.BASE}?r=content_new", json={"topic": "x" * 20}, headers={**st.HDR, "X-Agent-Token": tok})
        self.assertEqual(r.status_code, 401)


class T41_NewContent(unittest.TestCase):
    def setUp(self):
        reset_state()

    def test_form_becomes_a_content_task_for_jarvis_with_a_clean_brief(self):
        r = post("content_new", {"topic": "Why payments fail at small shops", "focus_keyword": "payment failed", "brand": "Wisi Pay", "language": "Hinglish",
                                 "words": 1000, "audience": "shop owners", "pages": "/blog/a\n/blog/b\n\n/pricing", "notes": "friendly"})
        self.assertEqual(r.status_code, 200, r.text)
        row = st.sql("SELECT title, category, status, assignee, details FROM tasks WHERE id = ?", (r.json()["id"],))[0]
        self.assertEqual(row[1:4], ("content", "doing", "jarvis"))
        self.assertEqual(row[0], "Content: payment failed")
        for must in ("Brand: Wisi Pay", "Language: Hinglish", "Focus keyword: payment failed", "Topic: Why payments fail", "about 1000 words", "INTERNAL PAGES to link: /blog/a, /blog/b, /pricing", "Extra notes: friendly"):
            self.assertIn(must, row[4])

    def test_missing_fields_get_safe_defaults(self):
        r = post("content_new", {"topic": "Instant settlement for shops"})
        details = st.sql("SELECT details FROM tasks WHERE id = ?", (r.json()["id"],))[0][0]
        self.assertIn("Brand: Wisi Pay", details)
        self.assertIn("Language: English", details)
        self.assertIn("choose a good 2-4 word focus keyphrase", details)
        self.assertIn("about 900 words", details)

    def test_language_and_length_are_whitelisted_and_clamped(self):
        r = post("content_new", {"topic": "A topic long enough", "language": "Klingon; DROP TABLE tasks", "words": 999999})
        details = st.sql("SELECT details FROM tasks WHERE id = ?", (r.json()["id"],))[0][0]
        self.assertIn("Language: English", details)
        self.assertIn("about 2500 words", details)
        r = post("content_new", {"topic": "Another topic long enough", "words": 3})
        self.assertIn("about 300 words", st.sql("SELECT details FROM tasks WHERE id = ?", (r.json()["id"],))[0][0])

    def test_too_short_topic_is_refused(self):
        self.assertEqual(post("content_new", {"topic": "hi"}).status_code, 400)
        self.assertEqual(st.sql("SELECT count(*) FROM tasks")[0][0], 0)

    def test_control_characters_and_overlong_fields_are_cut(self):
        r = post("content_new", {"topic": "Topic\x00with\x07control chars " + "x" * 5000, "focus_keyword": "k" * 500})
        details = st.sql("SELECT details FROM tasks WHERE id = ?", (r.json()["id"],))[0][0]
        self.assertNotIn("\x00", details)
        self.assertNotIn("\x07", details)
        self.assertLessEqual(len(details), 4000)

    def test_max_three_at_a_time(self):
        for i in range(3):
            self.assertEqual(post("content_new", {"topic": f"Topic number {i} here"}).status_code, 200)
        self.assertEqual(post("content_new", {"topic": "A fourth topic here"}).status_code, 429)

    def test_pause_blocks_new_content(self):
        post("pause", {"paused": True})
        try:
            self.assertEqual(post("content_new", {"topic": "A topic while paused"}).status_code, 409)
        finally:
            post("pause", {"paused": False})


class T42_ListAndGet(unittest.TestCase):
    def setUp(self):
        reset_state()

    def seed(self, passed=True):
        tid = post("content_new", {"topic": "Seeded topic for the list", "focus_keyword": "payment failed"}).json()["id"]
        res = {"doc": {"focus_keyword": "payment failed", "seo_title": "T" * 52, "meta_description": "M" * 130, "slug": "payment-failed", "body": GOOD_BODY},
               "pass": passed, "rounds": 2, "words": 348, "checks": [], "failed": [] if passed else ["x"], "manual": ["Grammar"], "trace": [], "at": int(time.time())}
        st.sql("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", (f"content_result_{tid}", json.dumps(res)))
        st.sql("UPDATE tasks SET status = 'review' WHERE id = ?", (tid,))
        return tid

    def test_list_shows_newest_first_with_pass_state(self):
        a = self.seed(True)
        b = self.seed(False)
        items = get("content_list").json()["items"]
        self.assertEqual([i["id"] for i in items][:2], [b, a])
        self.assertEqual((items[0]["pass"], items[1]["pass"]), (False, True))
        self.assertEqual(items[1]["rounds"], 2)

    def test_list_only_has_content_tasks(self):
        self.seed()
        st.sql("INSERT INTO tasks (user_id, title, created_at, category, status, details, assignee, updated_at) VALUES (1, 'Other', 1, 'other', 'todo', '', 'me', 1)")
        self.assertTrue(all(i["title"].startswith("Content:") for i in get("content_list").json()["items"]))

    def test_get_returns_the_article_fields_and_report(self):
        tid = self.seed()
        j = get(f"content_get&id={tid}").json()
        self.assertEqual(j["result"]["doc"]["slug"], "payment-failed")
        self.assertEqual(j["task"]["status"], "review")
        self.assertIn("Topic: Seeded topic", j["task"]["brief"])

    def test_unfinished_task_reports_progress_not_an_error(self):
        tid = post("content_new", {"topic": "Not finished yet topic"}).json()["id"]
        j = get(f"content_get&id={tid}").json()
        self.assertIsNone(j["result"])
        self.assertEqual(j["task"]["status"], "doing")

    def test_unknown_or_non_content_task_is_404(self):
        self.assertEqual(get("content_get&id=99999").status_code, 404)
        st.sql("INSERT INTO tasks (id, user_id, title, created_at, category, status, details, assignee, updated_at) VALUES (500, 1, 'Other', 1, 'other', 'todo', '', 'me', 1)")
        self.assertEqual(get("content_get&id=500").status_code, 404)


class T43_CheckRoute(unittest.TestCase):
    def test_own_text_is_checked_without_ai(self):
        r = post("content_check", {"focus_keyword": "payment failed", "seo_title": "Payment Failed? 5 Fixes Every Small Shop Should Know",
                                   "meta_description": "Payment failed at your counter? See why it happens and how small shops can cut failed payments with simple, practical steps.",
                                   "slug": "payment-failed-fixes", "body": GOOD_BODY})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["pass"])

    def test_failures_are_listed_with_numbers(self):
        j = post("content_check", {"focus_keyword": "payment failed", "seo_title": "Too short", "meta_description": "", "slug": "x", "body": "Payment failed. " * 5}).json()
        self.assertFalse(j["pass"])
        self.assertTrue(any("SEO title 50-60 characters: now 9" in f for f in j["failed"]))

    def test_size_limits(self):
        self.assertEqual(post("content_check", {"body": "short"}).status_code, 400)
        self.assertEqual(post("content_check", {"body": "x" * 60001}).status_code, 400)

    def test_markup_in_the_text_is_data_only(self):
        j = post("content_check", {"focus_keyword": "k", "body": "<script>alert(1)</script> " * 5 + "Payment failed today."}).json()
        self.assertIn("checks", j)


class T44_RulesEditor(unittest.TestCase):
    def override(self):
        return os.path.join(os.path.dirname(st.DB), "content_rules.md")

    def setUp(self):
        if os.path.exists(self.override()):
            os.remove(self.override())

    def test_default_rules_are_served_until_edited(self):
        j = get("content_rules").json()
        self.assertFalse(j["edited"])
        self.assertIn("Focus keyword in first paragraph", j["rules"])

    def test_save_keeps_the_owners_copy_outside_the_web_root_and_the_writer_reads_it(self):
        text = "# My rules\n" + "- Always keep sentences short and friendly for shop owners.\n" * 8
        self.assertEqual(post("content_rules_save", {"rules": text}).status_code, 200)
        self.assertTrue(os.path.exists(self.override()))
        self.assertNotIn(os.path.join(st.TMP, "site"), self.override(), "not inside the web root")
        self.assertTrue(get("content_rules").json()["edited"])
        cli = subprocess.run(["php", os.path.join(HERE, "_content_cli.php"), os.path.join(st.TMP, "site")], input=json.dumps({"op": "rules"}), capture_output=True, text=True)
        self.assertIn("Always keep sentences short", json.loads(cli.stdout)["rules"])

    def test_reset_brings_the_default_back(self):
        post("content_rules_save", {"rules": "# Mine\n" + "- A long enough custom rule line for the test.\n" * 8})
        j = post("content_rules_save", {"reset": True}).json()
        self.assertFalse(j["edited"])
        self.assertFalse(os.path.exists(self.override()))
        self.assertIn("Focus keyword in first paragraph", j["rules"])

    def test_tiny_or_huge_rules_are_refused(self):
        self.assertEqual(post("content_rules_save", {"rules": "x"}).status_code, 400)
        self.assertEqual(post("content_rules_save", {"rules": "x" * 30001}).status_code, 400)
        self.assertFalse(os.path.exists(self.override()))

    def test_saving_rules_raises_a_security_alert_and_is_logged(self):
        st.sql("DELETE FROM kv WHERE k LIKE 'alert_last_%'")
        post("content_rules_save", {"rules": "# Mine\n" + "- A long enough custom rule line for the test.\n" * 8})
        log = open(os.path.join(st.TMP, "site", "data", "security.log"), encoding="utf-8").read()
        self.assertIn("[content_rules]", log)


class T45_PageScript(unittest.TestCase):
    JS = os.path.join(ROOT, "server", "assets", "app.js")

    def test_script_has_no_syntax_errors(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        out = subprocess.run([node, "--check", self.JS], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)

    def test_content_tab_is_wired_in(self):
        js = open(self.JS, encoding="utf-8").read()
        self.assertIn("['content', 'Content']", js)
        self.assertIn("content: viewContent", js)
        self.assertIn("clearInterval(contentTimer)", js)

    def test_page_never_writes_server_text_with_innerhtml(self):
        js = open(self.JS, encoding="utf-8").read()
        start = js.index("function viewContent")
        end = js.index("// ---------- boot ----------")
        self.assertNotIn("innerHTML", js[start:end])

    def test_page_script_is_cache_busted_in_the_html(self):
        self.assertRegex(open(os.path.join(ROOT, "server", "index.html"), encoding="utf-8").read(), r"app\.js\?v=\d+")


if __name__ == "__main__":
    unittest.main(verbosity=2)

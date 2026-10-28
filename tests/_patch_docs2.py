import os
ROOT = r"C:\xampp\htdocs\ai"
p = os.path.join(ROOT, "docs", "SYSTEM.md")
s = open(p, encoding="utf-8").read()


def rep(old, new):
    global s
    assert old in s, old[:70]
    s = s.replace(old, new, 1)


rep("To change a rule: edit `server/content/rules.md` (the writer reads it) and, if a number changes, `content_check()`; run the tests; `deploy.ps1`.",
    """**The Content page** (web app, tab "Content", `assets/app.js` `viewContent`, routes `content_new`, `content_list`, `content_get`, `content_check`, `content_rules`, `content_rules_save`):
* *Naya content likhwao*: topic, focus keyword, brand (default Wisi Pay), language, words, audience, internal pages, notes. The server cleans the form into a brief (language whitelisted, 300-2500 words, control characters removed, at most 3 content tasks at a time, refused while paused) and creates the content task; the page starts the scheduler and follows the draft until it is ready.
* *Mere content*: history of the last 40 pieces with state (writing / pass / some checks fail / could not write), rounds and words.
* The opened result shows focus keyword, SEO title and meta description with their lengths, slug (each with a Copy button), the article in an editable box, **Dobara check** (re-measures the edited text, no AI), **Article copy karo**, a button that copies the article and opens ZeroGPT, the full check report, and a manual checklist (grammar, plagiarism, ZeroGPT) that the owner ticks.
* *Apna text check karo*: paste any text with its keyword/title/meta/slug and get the same report without AI.
* *Content rules*: the rules file in a text box. Save keeps the owner's copy in `jarvis_data/content_rules.md` (outside the web root, never overwritten by a deploy, and it wins over the shipped file); "Default par wapas" deletes it. Every save and reset is written to `data/security.log` and alerts the phone.
* Numbers the program measures (50-60, 30%, ...) live in `content_check()`; changing them still needs a developer change plus tests.

To change a rule's wording: edit it on the Content page (or `server/content/rules.md` and deploy). To change a measured number: `content_check()`, tests, `deploy.ps1`.""")

rep("| `tests/live_smoke.py` (`run_all.py --live`) | **11** |",
    "| `tests/content_page_test.py` | **27** | Every Content-page route needs a login (an agent token does not work); the form becomes a clean content task (defaults, whitelisted language, clamped words, control characters removed, max 3 at a time, blocked while paused); list and get; own-text check route and its limits; rules editor (default served, save kept outside the web root and read by the writer, reset, size limits, alert + log); the page script has no syntax error, is wired into the tabs, never uses `innerHTML` for server text. |\n| `tests/live_smoke.py` (`run_all.py --live`) | **11** |")
rep("Last full run: **2026-10-28 — 181 tests (170 offline + 11 live), 33 sub-checks, 0 failures**",
    "Last full run: **2026-10-28 — 208 tests (197 offline + 11 live), 33 sub-checks, 0 failures**")
rep("* **Content Rules:** the owner's rules file enforced by a program checker and a write-check-fix loop; 4 of 4 real live runs passed all required checks.",
    "* **Content Rules:** the owner's rules file enforced by a program checker and a write-check-fix loop; 4 of 4 real live runs passed all required checks. **Content page** in the web app (brief form, history, result with copy buttons, own-text check, rules editor); layout checked in a browser through the page DOM only, a real phone screen was not looked at.")
rep("6. **Content:** a content page in the web app (brief form, rules editor, history), brand profiles beyond Wisi Pay, plagiarism and grammar API checks if the owner has keys.",
    "6. **Content:** brand profiles beyond Wisi Pay (rules per brand), export of the result as a ready-to-publish file, plagiarism and grammar API checks if the owner has keys, publishing to the site.")
rep("| 2026-10-28 (later) |", "| 2026-10-28 (content page) | **Content page** in the web app: brief form, history, result with copy buttons and report, \"Dobara check\", own-text check, rules editor (owner's copy kept outside the web root). Tests 181 to 208. |\n| 2026-10-28 (later) |")
open(p, "w", encoding="utf-8", newline="\n").write(s)

p2 = os.path.join(ROOT, "docs", "SECURITY_PRIVATE.md")
t = open(p2, encoding="utf-8").read()
old = "| Content | the writer treats the owner's brief as data; output is only text (no tool calls) | `content_test` T35 |"
assert old in t
t = t.replace(old, old + "\n| Content page | all routes need an owner login (agent tokens refused); form fields whitelisted, length-limited and stripped of control characters; page script never uses `innerHTML` for server text; rules edits are saved outside the web root, size-limited and raise an alert | `content_page_test` T40-T45 |", 1)
t = t.replace("181 tests (170 offline + 11 live)", "208 tests (197 offline + 11 live)", 1)
open(p2, "w", encoding="utf-8", newline="\n").write(t)
print("docs ok")

# Jarvis — digital employee: system guide

> **Living document.** Read "7. Status" and "8. Roadmap" first. After every change update: Status, Changelog (section 9), test counts (section 6).
> Last updated: 2026-11-02. Security weaknesses and fixes are kept in `docs/SECURITY_PRIVATE.md` (not in git: this repository is public).

## 1. Aim

One owner, many devices (laptop, phone, iPad, TV...). The owner talks to Jarvis from any device in Hindi, Hinglish or English
("laptop ka chrome kholo", "mere mobile me youtube par ye gaana baja do", "claude par kya chal raha hai"). Jarvis works out **what** is meant and
**which device** should do it, and the work happens there, remotely, within a second for everyday commands. To the owner it feels like a
digital employee who has hands on every device. Bigger jobs (research, writing, coding, calls to leads) go to AI models and run as tasks.

## 2. How it works (one request, start to finish)

```
 Owner (phone browser / Android app / laptop browser)
      │  1. text or voice  ->  POST api.php?r=chat          (HTTPS, session cookie of that device ID)
      ▼
 SERVER  ai.udaypurgroup.in  (PHP 8.2 + SQLite, Hostinger)
      │  2. reflex_match()   rules, ~16 ms, no AI      "chrome kholo", "youtube par X chalao", "awaaz kam karo", "google par X search karo"
      │  3. skill_match()    things Jarvis already learned
      │  4. brains in order  Gemini flash-lite (~2 s)  ->  OpenAI  ->  the laptop's own AI CLI (slow, last resort)
      │  5. apply_brain_plan()  -> tools.php: pick the device, validate arguments, decide: run now / ask owner to Approve
      │  6. INSERT into commands (device_id, action, args, status = pending | awaiting_confirm)
      ▼
 AGENT on the target device (Windows app JarvisAgent.exe / Android Jarvis.apk)
      │  7. long-poll api.php?r=agent_poll  (server checks every 50 ms, so a new command arrives within ~0.1 s)
      │  8. runs the action (open Chrome profile, open URL, volume, lock, Start Menu program, operate on screen...)
      │  9. POST agent_result  -> chat shows the real result
```

Which device? `reflex_target()` / the brain prompt decide in this order: words in the sentence (laptop/PC/desktop -> a PC agent, mobile/phone/android -> the
phone agent, a device's own name -> that device) → otherwise the device the owner is speaking from → otherwise the other kind. If exactly one agent of the right
kind is online but the name differs ("Laptop" vs "Office Laptop"), it is used anyway.

Speed budget measured on 2026-10-28 (see section 6): chat → command queued 16 ms (server work), queued → agent receives ≤ 180 ms before the 50 ms change,
HTTPS round trip PC↔server ≈ 150 ms, Chrome start ≈ 0.2–0.5 s. Everything that is not a reflex pays one AI call (~2 s with Gemini flash-lite, thinking off).

## 3. Devices and logins (no codes)

* The owner account is created once (`setup`). In the web app: **Devices → Device ID aur Password → + Naya device ID** — name, type (Laptop, Android, iPad, TV...), username, password.
  Every device gets its own username/password. The owner can change a password any time (Edit); the device is signed out and must use the new one.
* **Browser/phone web page** signs in with `login` (a device cookie, role `client`).
* **Windows app / Android app** sign in with `agent_login` (role `agent`), the app keeps the password (Windows: encrypted with DPAPI) and signs in again by itself if the token disappears.
* One device ID = one running agent; a new sign-in replaces the older agent session. A browser login with the same ID does not kick the agent.
* Agents cannot be blocked; an agent that is online cannot be deleted. Every block/delete/rename is written to `server/data/device_audit.log`.
* Old pairing-code routes (`pair_create`, `agent_pair`, `pair_login`) still exist only so the old Android APK keeps working until the new one is installed.

## 4. File map

### Server — `server/` (deployed to `~/domains/udaypurgroup.in/public_html/ai`)
| File | What it does |
|---|---|
| `api.php` | Single entry point, `?r=<route>`. Routes: session (`state setup login logout`), devices (`devices device_block/delete/rename device_logins device_login_save/delete agent_login agent_pair pair_create agent_create`), chat (`chat chat_poll chat_history chat_clear`), PC commands (`commands command_result command_decide message_decide`), agent side (`agent_poll agent_result agent_progress operator_step app_update app_update_file`), tasks/notes/reports/routines, library, leads/campaigns/calls, `skills`, `status`, `tick`. CSRF: every POST needs header `X-Requested-With: jarvis`. |
| `lib/auth.php` | Device cookie / `X-Agent-Token` lookup (`current_device`), `create_device`, brute-force counter (8 failures / 15 min / IP), JSON helpers. |
| `lib/reflex.php` | Rule-based instant commands: open app / site / Chrome profile / any Start Menu program, YouTube play/search, Google & Maps search, volume, close app, lock, CPU status, Claude session history, call a contact, medical quiz. `reflex_target()` picks laptop or phone. |
| `lib/brain.php` | Brain chain (Gemini → OpenAI → Claude API → laptop), prompt builder (devices, `speaking_from`, device-choice rules), plan parser, `online_agent()`, `client_kind()`. |
| `lib/llm.php` | Gemini/OpenAI HTTP calls. Gemini thinking is off (`thinkingBudget 0`: 1.8 s instead of 14 s on gemini-3.5-flash), timeouts 10/15 s, a failing model or an OpenAI account without credits is skipped for 3 min / 6 h. Errors go to `data/llm_errors.log`. |
| `lib/tools.php` | The tool catalogue the AI may use, argument validation (`clean_pc_args`), approval rules (`needs_approval`), `queue_command`, `find_agent` (+ single-agent fallback), phone buttons. |
| `lib/skills.php` | "Seekha": remembers plans that worked so the same sentence is answered without AI next time. |
| `lib/memory.php` | Long-term memory: projects, work style, Chrome profile purposes, standing authority (actions allowed without asking). |
| `lib/tasks.php` | Task board, Jarvis-assigned tasks (news, research, drafts), routines, reports. |
| `lib/leads.php`, `lib/whatsapp.php` | Campaigns/leads/call logs; WhatsApp contacts list. |
| `lib/library.php`, `lib/medical.php`, `lib/knowledge.php` | Owner's files (PDF/photo/video/db) indexed for questions; medical + exam library; 570 open-source playbooks in `knowledge/` used as reference text. |
| `lib/content_rules.php` | **Content Rules**: `content_check()` measures a draft against the owner's rules (title/meta/slug/keyword placement, density, links, headings, paragraph and sentence length, transitions, passive, Flesch, closing CTA, stock AI phrases, em dashes); `content_write()` writes with Gemini and revises up to 3 times (keeps the better draft, time-boxed). |
| `lib/content_quality.php` | **CQO gates**: versions, checks (provider or owner-run), the five gates and their statuses, strict/review mode, LanguageTool grammar provider behind a consent switch, correction cycles (max 3), owner approval and publish authorisation (record only), source register, audit, dashboard. |
| `lib/tutor.php` | **Language tutor**: learners and class plans, daily lesson (validated JSON), correction, spaced-repetition quiz, progress and streak, class-time reminders, speech language codes. |
| `content/rules.md` | The owner's content rules file (+ Yoast reference + human-writing section). **Not in git** (private); copied to the live site by `deploy.ps1`. `content/.htaccess` denies web access. |
| `lib/claude.php` | Direct Claude API chat loop (used when `brain` = api). |
| `lib/db.php` | SQLite connection (WAL), schema + migrations (`SCHEMA_VERSION`), `kv` store. |
| `assets/app.js`, `assets/style.css`, `index.html` | The web app (chat, tasks, notes, devices, library, leads, Command Center). |
| `config.php` (server only, never in git) | Secrets and switches: API keys, `brain`, `brain_order`, `db_path` (outside web root: `~/jarvis_data/app.sqlite`), `setup_key`. `config.sample.php` documents every key. |
| `data/` | Logs only (`llm_errors.log`, `device_audit.log`); `.htaccess` denies web access. Database, uploads and app downloads live in `~/jarvis_data/`, outside the web root. |

### Windows agent — `agent/`
| File | What it does |
|---|---|
| `jarvis_app.py` | The tray app (`JarvisAgent.exe`): login window (server + device username/password), tray status colours, Settings (project folders, autostart), `--setup/--settings/--vault/--selftest`. Files in `%APPDATA%\JarvisAgent`. |
| `agent.py` | The loop: long-poll, run actions, report results. Actions: `open_url open_app (config → built-in table → Start Menu search) volume close_app lock shutdown restart cpu_status speak claude_sessions window_read screen_look web_research brain_chat operate ui_control vault_* call_run` and the `claude/gemini/codex_read|work` AI CLIs. Re-login with saved password on 401 (back-off 1 min, 10 min, then hourly on a wrong password). |
| `ops.py` | Hands: Chrome profile launcher (`open_chrome`), keyboard/mouse like a person (`ui_control`, `operate` loop), password vault (DPAPI, never leaves the PC), on-screen banner + visible mouse glide + red click ring, self-update (`check_update`, every 30 min, SHA-256 checked, only if the server version is higher than `VERSION`). |
| `callrun.py` | Phone-call runner for leads (Gemini Live audio). |
| `ed25519.py` | Pure-Python Ed25519 signature verification used by the self-update (no dependencies). |
| `start_agent.bat`, `pair_agent.bat`, `build_windows.bat`, `JarvisAgent.spec` | Console start, login window, PyInstaller build → `dist/JarvisAgent.exe`. |
| `install_keepalive.ps1` | The owner runs it once (no admin): creates the per-user Scheduled Task "JarvisAgent KeepAlive" (start at sign-in, check every 5 minutes, restart on failure, no time limit, also on battery). `-NoSleepOnPower` (asks for YES) also sets never-sleep and lid-close-does-nothing while plugged in; `-DryRun` changes nothing; `-Remove` deletes the task. |

### Android app — `android/app/src/main/java/com/udaypurgroup/jarvis/`
`SettingsActivity` (login + permissions), `PhoneAgentService` (foreground service, long-poll), `ActionRunner` (YouTube play, call, open URL, notify, scan files), `Updater` (hourly check, SHA-256, silent install), `Prefs`, `Http`, `Notify`, `BootReceiver`, `MainActivity` (web view of the site).
Version: `versionCode 3 / 1.2` in `build.gradle.kts`. **Gradle is not installed on the dev PC, so the APK is built elsewhere (Android Studio).**

### Other
* `deploy/` — `deploy.ps1` (push + update server + copy the private content rules), `server-update.sh` (runs on the server: lint, backup, rsync, health check, rollback), `release_tools.py` (makes the signing key, signs and publishes the Windows/Android app), `backup-db.sh` (manual DB copy on the server), `pull-db-backup.ps1` (copies the newest server backup to this PC), `README.md`.
* `knowledge/education/` (spoken English teacher, learn any language) and `knowledge/content/content-quality-originality.md`: the teaching method and the CQO rules saved in the knowledge library so the model gets them with every lesson / content job.
* `tests/` — `server_test.py`, `agent_test.py`, `security_test.py`, `content_test.py`, `cq_test.py`, `tutor_test.py`, `keepalive_test.py`, `content_page_test.py`, `live_smoke.py`, `run_all.py`, `last_run.json`, `fixtures/good_article.md`.
* `docs/` — `SYSTEM.md` (this file), `VIDEO_SCRIPT.md` (script, fact sheet and shot list for a video about the system), `SECURITY_PRIVATE.md` (not in git).
* Repository root (`jarvis.py`, `news.py`, `Face-Recognition/` ...) — the original desktop Jarvis scripts, not part of this system.
* `server/knowledge/` — playbooks + `mcp_server.py` (knowledge MCP server).

## 5. Approval model

Small, reversible actions run by themselves (`open_app open_url(known domains) volume lock cpu_status claude_sessions window_read web_research vault_ask vault_sites`).
Anything that edits files, powers off, closes programs, calls someone, opens an unknown link, **reads the screen (`screen_look`), types or clicks (`ui_control`, `operate`) or fills a saved password (`vault_fill`)** waits in **Pending** for the owner's tap (`command_decide`). The owner can still say in chat that `operate` / `ui_control` / `screen_look` may run on their own (standing authority); `vault_fill`, shutdown, restart, calls and file deletion can never be made automatic.

**Pause switch:** the web app's Devices page has an Emergency button, the chat understands "jarvis pause" and "jarvis resume", and the tray menu has a local PAUSE. While paused every agent stays online but receives nothing, and no command can be queued.

**Offline watchdog:** `agents_watchdog()` (lib/auth.php) runs from every agent poll and from the scheduler, at most every 20 s. An agent with no poll for 180 s is reported as offline ("Laptop ... offline ho gaya, N minute se") and, when it returns, as back online; each at most once per 5 minutes per device, never for a device that was not seen online first, and not for 3 minutes after a hosting outage (so a server restart does not blame every device). The phone gets the notification when it is online; the line is always in `data/security.log`.

**Keeping the laptop agent alive:** inside the app, a stray error in the poll loop is logged and the loop carries on; a tray watchdog restarts the agent thread within 30 s if it ever ends; while the laptop is on mains power the agent asks Windows not to sleep (`SetThreadExecutionState`, released when it stops, no setting changed). Outside the app: `install_keepalive.ps1` (above) restarts a closed app.

**Alerts:** new device login, device block or delete, new device ID, password change, lockout and pause are written to `data/security.log` and shown as a notification on the phone when the phone agent is online (one per kind per 5 minutes).
The agent also refuses to type or click in windows whose title looks like a bank, payment or password manager (`ops.SENSITIVE`) and refuses dangerous key combos.

## 5b. Content Rules (blogs, articles, page copy)

The owner's rules live in `server/content/rules.md` (SEO + Yoast readability + brand voice + **human-written for ZeroGPT**). Every request to write content becomes a **content task**: the brain is told never to write it in chat but to call `add_task` (category `content`, assignee jarvis, the full brief). The scheduler then:

1. asks Gemini for the draft in a fixed format (focus keyword, SEO title, meta description, slug, Markdown body) together with the rules, the human-style rules and the brief (the brief is treated as data);
2. measures it with `content_check()`: about 30 checks, each with the measured number and, when it fails, an exact hint ("add a connector to at least 4 more sentences", "cut at least 3 characters");
3. asks for fixes (up to 3 more rounds, 95 s budget), keeping the better draft and any header line the model leaves out;
4. delivers the article, SEO title, meta description, slug and the full check report in the task (status Review).

Measured on the live server (4 real runs, 2026-10-28): 4 of 4 passed every required check in 2-4 rounds, 11-86 s, 746-968 words (800+ words is only advice). **A program cannot check grammar, plagiarism (under 1%) or the ZeroGPT score, so the result always says "check these yourself" and never claims a ZeroGPT pass.** Measures taken against AI detectors: no stock AI phrases, at most 2 em dashes, varied sentence length, no repeated sentence starters, concrete examples, no invented facts.
**The Content page** (web app, tab "Content", `assets/app.js` `viewContent`, routes `content_new`, `content_list`, `content_get`, `content_check`, `content_rules`, `content_rules_save`):
* *Naya content likhwao*: topic, focus keyword, brand (default Wisi Pay), language, words, audience, internal pages, notes. The server cleans the form into a brief (language whitelisted, 300-2500 words, control characters removed, at most 3 content tasks at a time, refused while paused) and creates the content task; the page starts the scheduler and follows the draft until it is ready.
* *Mere content*: history of the last 40 pieces with state (writing / pass / some checks fail / could not write), rounds and words.
* The opened result shows focus keyword, SEO title and meta description with their lengths, slug (each with a Copy button), the article in an editable box, **Dobara check** (re-measures the edited text, no AI), **Article copy karo**, a button that copies the article and opens ZeroGPT, the full check report, and a manual checklist (grammar, plagiarism, ZeroGPT) that the owner ticks.
* *Apna text check karo*: paste any text with its keyword/title/meta/slug and get the same report without AI.
* *Content rules*: the rules file in a text box. Save keeps the owner's copy in `jarvis_data/content_rules.md` (outside the web root, never overwritten by a deploy, and it wins over the shipped file); "Default par wapas" deletes it. Every save and reset is written to `data/security.log` and alerts the phone.
* Numbers the program measures (50-60, 30%, ...) live in `content_check()`; changing them still needs a developer change plus tests.

To change a rule's wording: edit it on the Content page (or `server/content/rules.md` and deploy). To change a measured number: `content_check()`, tests, `deploy.ps1`.

## 5c. Content Quality & Originality gates (CQO)

The owner's master rulebook (content/rules.md section 9) is enforced around every content task. All numbers below are the owner's; nothing is ever invented.

| Gate | Rule | How it is checked today |
|---|---|---|
| Grammar | 85% or more | **Real provider: LanguageTool public API**, only after the owner switches on "Bahari provider allow karo" (the article text then leaves the server). Score = 100 x (1 - weighted errors / words), shown as the system's own score from the provider's findings. English (US/UK), French, German, Spanish, Portuguese, Italian, Dutch, Russian, Arabic, Chinese, Japanese and a few more. **Hindi, Hinglish and the Indian languages: NOT VERIFIED** (the owner may enter another tool's real result). |
| AI detection | 8% or less | **Sapling AI Detector API** (official docs checked 2026-11-02: `POST https://api.sapling.ai/api/v1/aidetect`, Bearer key, score 0-1 x 100, `zero_retention` always on) once the owner saves a key on the Content page (Provider Settings), switches on the external-provider consent and the article language is supported (English, Spanish, Portuguese, French, German, Italian, Dutch, Japanese; **not Hindi/Hinglish**). Text under 500 characters or a low-confidence answer is not evidence. Every failure (key refused, limit, bad answer) is NOT VERIFIED. The owner can also enter ZeroGPT/GPTZero/Copyleaks results by hand (kind "manual"). Several detectors are listed separately, never averaged: any FAIL fails the gate; a detector that could not check never blocks one that did. |
| Plagiarism | raw similarity exactly 0% and no unattributed copying | Same: the owner enters the real checker result; both numbers (raw, unattributed) are kept. |
| Factual | sources checked | Source register (name, URL, access date, information used, type, reliability) + the owner's tick. |
| Evidence | provider, time, version | Every check row has provider name, kind, version, start and finish time, language and a (secret-free) raw response. |

* **Statuses:** APPROVED (all pass), REJECTED (any fail), NOT VERIFIED (any missing; a failure wins over a gap), MANUAL REVIEW REQUIRED (3 cycles used and still not approved).
* **Versions:** the writer saves version 1; every owner edit and every correction cycle is a new numbered version; none is ever deleted; checks belong to one version, so a new version starts NOT VERIFIED and must be checked again in full.
* **Correction (max 3 cycles):** "Check + auto sudhaar" re-checks grammar and, while it FAILS, asks the model to fix the listed errors (prompt forbids evasion: no deliberate mistakes, hidden characters, random synonyms, synonym-swapping against copying; keeps facts and citations) and re-checks the whole new version. "Sudhaar cycle chalao" does the same from the owner's detector/plagiarism report (treated as data). Every cycle records its reason.
* **Strict / review mode:** strict (default) can be approved; review mode shows everything but can never approve.
* **Approval:** two explicit owner steps ("approve", then "publish allow"); the second only records the permission: **nothing is sent to any website or platform by this code**.
* **Dashboard:** totals, approved/rejected/pending, manual review, failed checks, average grammar/AI/plagiarism from the records, and each provider's honest state (CONNECTED & VERIFIED / CONFIGURATION REQUIRED).
* **Tested for real on 2026-11-02:** a real LanguageTool call from the server (4 findings on a 33-word sample, score 89.4); a real request to the Sapling endpoint from the server with a deliberately fake key returned `401 {"msg":"Invalid API key."}`, which confirms the URL and the Bearer format (the adapter maps it to "key manzoor nahi"). **Not yet done: a real scan with a real Sapling key** (the owner creates a free account at sapling.ai: 50,000 characters per day free) and then "Test connection". The state shows CONNECTED & VERIFIED only after that real answer.
* **Provider research (2026-11-02, official pages):** Sapling = simple synchronous API, free tier, supports 8 languages, `zero_retention` (chosen). Copyleaks = AI detector `POST /v2/writer-detector/{scanId}/check` (255-100,000 characters, Bearer login token, sandbox mode) and plagiarism scan `PUT /v3/scans/submit/file/{scanId}` which delivers results **only by webhook** (needs a public HTTPS webhook route, credits are paid; login endpoint and language list not verified) -> not connected. GPTZero = `POST /v2/predict/text` with `x-api-key`, but its request/response fields, languages and plans were not shown in the docs page that was readable -> not connected. Originality.ai = `/scan` endpoints, docs not readable enough to tell AI from plagiarism -> not connected. ZeroGPT = no official API reference found. Plagiarism therefore stays owner-entered (state UNAVAILABLE).
* **Keys:** saved from the page into `jarvis_data/provider_keys.json` (outside the web root, mode 600) or `sapling_api_key` in config.php; never returned to the page (only the last 4 characters), never logged or stored in check records.

## 5d. Language tutor (the "Class" tab)

For a beginner such as a village boy who speaks Hindi: English (American, British, Indian, Australian) or any other language. The trainer is asked first (name and level, class time, minutes, days, accent or language, goal); the form and the chat ("english sikhna hai") ask exactly that.

* **Every day:** one lesson from the model, validated before it is shown: a real-life theme, 10 everyday words (meaning and pronunciation hint in the learner's own script, a short example), 5 speaking sentences, a 6-line dialogue, a writing task, a speaking task, a tip and **a diagram** (boxes, flow, timeline or word map) that the page draws itself from the data (no model-made HTML).
* **Method:** `knowledge/education/spoken-english-teacher.md` and `learn-any-language.md` go into every lesson prompt: simple Hindi first, one idea at a time, daily-use words, sentence frames, village examples, never harsh, hard sounds for Hindi speakers, American vs British differences.
* **Practice:** listen (browser speech synthesis in the chosen accent), speak (browser speech recognition, Chrome), write; the model corrects kindly (at most 3 mistakes, one simple Hindi sentence each, praise first, other ways to say it, a tip); a spoken answer is treated as a possibly misheard transcript. 60 corrections per learner per day.
* **Revision:** spaced repetition (boxes 1-6, due after 0, 1, 2, 4, 8, 16 days; a wrong answer goes back to box 1) as a 4-choice quiz.
* **Progress:** streak, words learned and mastered, accuracy of the last 7 days, 14-day chart, repeating mistakes.
* **Class time:** at the trainer's time (within 30 minutes) a chat message and, if the phone is online, a phone notification: once a day per learner, on the chosen days.
* **Measured on the live server (2026-11-02):** a real lesson in 4.3 s (theme "mobile", 10 words with Hindi meanings, a Subject + Verb + Object diagram) and a real correction in 3.1 s ("I goes to market for buy vegetable yesterday" -> "I went to the market to buy vegetables yesterday", 3 mistakes explained in Hindi). Nobody has used the Class tab with a real learner yet.

## 6. Testing

| Suite | Tests | What it covers |
|---|---|---|
| `tests/server_test.py` | **49** (+33 sub-checks) | Setup, device IDs, agent login, session replacement, password change, agent protection, audit log, 28 routing sentences + 5 that must not be hijacked, speed, offline answer, approvals, command lifecycle, long-poll wake-up, rate limit, bad input, SQL-injection strings, brute-force lockout, CSRF header. Runs on a throw-away copy of `server/`. |
| `tests/agent_test.py` | **33** | Built-in apps, Start Menu search, Chrome profile matching, DPAPI round trip, config rules, volume, close-app, `open_url` schemes, version compare, bank/password window guard, key-combo guard, re-login against the real server code. |
| `tests/security_test.py` | **33** | Ed25519 verification (valid, tampered, wrong key, garbage, platform/version binding, the real release key matches the app and the APK); the update installer (signed file installed; unsigned, wrong-key, swapped-file and re-hashed manifests refused); approvals (screen control and password typing need Approve, standing authority, `vault_fill` never automatic); pause switch (voice, web, agents receive nothing, everyday words never pause); per-account lockout (one stale device password cannot lock the owner, IP-wide limit); 30-day token expiry (legacy paired agents untouched); security alerts and their rate limit; daily database backup (checked copy, 14 kept, no second one the same day). |
| `tests/content_test.py` | **55** | The owner's rules file is loaded unchanged; a good article passes; every SEO and readability rule fails when broken (title/meta length, keyword in first paragraph / title / meta / slug / headings / image alt, density, word count, image, internal links, subheading gap, paragraph and sentence length, transitions incl. Hinglish, passive incl. Hinglish, Flesch, closing CTA); human-writing signals; parser; writer loop (stops when it passes, revises with exact numbers, keeps the better draft, gives up after 4 rounds, time budget); a whole content task; the brain routes content to it; never claims a ZeroGPT pass. |
| `tests/content_page_test.py` | **27** | Every Content-page route needs a login (an agent token does not work); the form becomes a clean content task (defaults, whitelisted language, clamped words, control characters removed, max 3 at a time, blocked while paused); list and get; own-text check route and its limits; rules editor (default served, save kept outside the web root and read by the writer, reset, size limits, alert + log); the page script has no syntax error, is wired into the tabs, never uses `innerHTML` for server text. |
| `tests/cq_test.py` | **59** | Auth and owner isolation; every threshold and boundary (85 / 84.9, 8 / 8.1, 0 / 0.1); manual evidence validation and labelling; unsupported detector language; factual gate and source register; every status combination (a failure wins over a gap); strict and review mode; two-step approval and revoke; publish authorisation sends nothing; versions (never deleted, new version loses approval, old keeps its own evidence); LanguageTool through a local stub (consent off sends nothing, weighted formula, US/UK/French/German codes, Hindi/Hinglish/Tamil NOT VERIFIED, provider 500 / garbage = NOT VERIFIED, long text split, raw response saved); correction cycles (fix and recheck, stop at 3, manual review, prompt forbids evasion and carries the real findings); dashboard numbers; audit; migration is additive. |
| `tests/tutor_test.py` | **62** | Auth and isolation; the trainer's class plan and validation; accent and language choose the speech voice; lesson validation (cleaning, limits, broken lessons never saved), same-day reuse, prompt content, older words return; correction (clamping, HTML stripped, spoken answers treated gently, daily limit); spaced repetition (box moves, intervals, wrong answer resets, foreign words refused); progress (streak, accuracy, chart, boxes, repeating mistakes); class reminders (time window, days, once a day, phone); the chat asks the trainer's questions; knowledge files saved; the page script (no HTML injection, SVG text only, speech fallbacks). |
| `tests/provider_test.py` | **41** | Sapling adapter against a stub that follows the official API: routes need the owner and isolate owners; key handling (32 characters, outside the web root, never returned, removable, logged without the key); honest states (a saved key is not "verified", only a real answer is); request format (Bearer header, `zero_retention`, `sent_scores`, markdown stripped, key never in the body); thresholds 8 / 8.1; flagged passages kept; no permission or no key sends nothing; unsupported languages never sent; short and low-confidence results are not evidence; 401/403/429/500/garbage/no-score = NOT VERIFIED; key never in any record; several detectors listed separately and never averaged; the page script (key field hidden and cleared). |
| `tests/keepalive_test.py` | **20** | Offline alert once and not repeated; back-online notice; a short gap is no alert; a never-online device is not reported; grace after a hosting outage; log line; scheduler also runs the watchdog; deleted device ignored; the agent loop survives a non-network error; tray watchdog wired in; keep-awake on mains / desktop / battery / release on stop; the Task Scheduler script parses, has the restart settings, never asks for admin, needs a typed YES for the power change, and its dry run changes nothing. |
| `tests/live_smoke.py` (`run_all.py --live`) | **11** | The live site with no password: HTTPS, redirect, headers, secret files not public, removed backdoors stay gone, auth required, setup closed, new code deployed. |

Run: `agent\venv\Scripts\python.exe tests\run_all.py` (offline) or add `--live`. The agent venv needs `pip install cryptography` for the tests only; the exe excludes it.

Last full run: **2026-11-02 — 390 tests (379 offline + 11 live), 33 sub-checks, 0 failures** (`tests/last_run.json`). Bugs the tests found and that were fixed the same day: song request "baja do" fell to the slow AI;
"awaaz badhao" ignored when spoken from the phone; "chrome kholo aur google search karo" was cut to a Google search; the agent counted a network error as a wrong password.
Measured: chat → queued median 16 ms (max 33); queued → agent poll returns median 163 ms (before the 50 ms poll step).
**Not tested:** a real command from the Android app to the live server (needs the owner's password), the Android app itself (Kotlin is not compiled on this PC, so the Android signature check and re-login are untested), a real ZeroGPT run, the on-screen banner during a real task, Windows autostart after a reboot, behaviour with 2+ PCs online, load. There is no CI yet — tests run by hand.

## 7. Status (2026-11-02)

**Live check, 2026-11-02 (everything deployed from commit `263d40a`; read-only checks on the live server and the laptop)**

| Check | Result |
|---|---|
| Code on the server = repository | all 31 tracked server code files identical (SHA-256), the private rules file identical, 584 knowledge files on both sides |
| Database | schema v12 (code expects 12), integrity ok, WAL, foreign keys on, 352 KB; 1 owner, 3 device IDs |
| Backups | 3 checked copies in `jarvis_data/backups`, newest 17 h old (the scheduler makes one a day) |
| Agent | "Laptopai" ONLINE (last seen 9 s before the check), watchdog state `on`, not paused |
| Updates | live manifest = Windows app 1.2.6, signature present and verified with the key built into the app, file hash matches; the laptop's installed exe has the same hash |
| Files and secrets | `config.php` mode 600; keys set: Gemini, OpenAI (no credits); no Sapling key saved yet; no secret file reachable from the web (live smoke test) |
| Web | `app.js?v=29`: Command Center is its own tab (below Leads); every chat answer has a Copy button (question + answer); Content, Quality Gate, Provider Settings and Class views; all new routes answer 401 without a login |
| Live smoke tests | 11 of 11 pass; full suite 390 tests (379 offline + 11 live) pass |
| Server | PHP 8.2.35, SQLite 3.54.1, curl and mbstring present; disk 58% used |
| Not fine / not done | the Task Scheduler "KeepAlive" task does **not** exist yet (the owner has not run the script); the laptop app still runs on its old token (login not saved); Gemini still times out now and then (last logged 08:31 UTC, 25 s); OpenAI has no credits; the live `data/security.log` does not exist yet because no security event has happened since it was added |
| Could not check | any owner-login feature end to end on the live site (the owner's password is not available to Claude); a real Sapling scan (no key); the phone app |

A stray 8 KB test database (`server/data/library/_peek_*.sqlite`, two harmless rows) had been committed by accident on 2026-10-24; it was removed from tracking and `server/data/library/` and logs are now ignored.


**Done and working**
* Device ID + password for every device; agent sign-in without codes; automatic re-login (Windows tested, Android code written but not compiled).
* Instant reflex layer for everyday commands; device chosen from the words or the speaking device; single-agent fallback; Chrome profile launch; any Start Menu program by name.
* Fast brain: Gemini with thinking off; failing providers skipped. On-screen banner and visible mouse while the agent works.
* **Security fixes (2026-10-28):** screen control and password typing need Approve; Pause switch (web, chat, tray); updates must carry the owner's Ed25519 signature (Windows app 1.2.5 published and installed, signed); lockout per IP + username; agent tokens expire after 30 days and the apps sign in again; security alerts to log and phone; daily checked database backup (14 kept) inside the scheduler.
* **Content Rules:** the owner's rules file is enforced by a program checker and a write-check-fix loop; 4 of 4 real live runs passed all required checks. **Content page** in the web app (brief form, history, result with copy buttons, own-text check, rules editor); layout checked in a browser through the page DOM only, a real phone screen was not looked at.
* **CQO gates and the Class tab (2026-11-02):** see sections 5c and 5d. Real checks done: LanguageTool, a real lesson and a real correction. AI detection: Sapling adapter built and tested against a stub, **real scan with a real key not done yet**; plagiarism API not connected (owner enters real results). Not used yet with a real learner.
* **Keep-alive (2026-11-02):** offline and back-online alerts to the phone, agent survives stray errors, tray watchdog, keeps the laptop awake on mains power, signed app 1.2.6 installed. The Task Scheduler script exists but **has not been run** (the owner runs it).
* Deploy by git pull with backup and rollback; 390 automated tests.

**Written but not finished or not verified**
* The Android APK (login, re-login, signature check) is **not built** (no Gradle on this PC; `versionCode` is 3). Phones still run the old code-pairing APK.
* The laptop app still runs on its old token until the owner enters the device username and password once (tray, Settings, Dobara login karo).
* The signing key lives only on this PC (`%USERPROFILE%\.jarvis_signing`); **it must be backed up** (USB stick). Without it no update can be published.
* No real phone to live server to laptop test by Claude (no owner password). No real ZeroGPT run (it cannot be called from here).
* Not done from the security list: rotate hosting, SSH, database passwords and all API keys; make the repository private; 2FA; the weekly off-server copy of the database (script exists, `deploy\pull-db-backup.ps1`, not scheduled); remove the legacy pairing routes after the new APK.

**Roadmap, in order**

1. **Owner actions (Claude cannot do these):** rotate every secret, run the Hostinger malware scan, back up the signing key, make the repository private, enter the device password on the laptop.
2. **Build and ship the Android APK** with `deploy\release_tools.py publish android <apk> 3 1.2`, then delete the legacy pairing routes.
3. **Keep the laptop agent alive (mostly done):** the app survives errors, keeps the PC awake on mains and the server alerts when it goes offline. **Owner action:** run `agent\install_keepalive.ps1` once (and `-NoSleepOnPower` if the lid is closed during the day). Still open: an alert by WhatsApp/e-mail when the phone is offline too; Wake-on-LAN.
4. **CI:** GitHub Actions running `tests/run_all.py`; deploy only when green.
5. **2FA** for the owner login (TOTP), separate admin and operator roles; tokens in DPAPI / Keystore.
6. **Content:** owner creates a free Sapling key, saves it in Provider Settings and presses Test connection (then a first real scan); a plagiarism API (Copyleaks needs a public webhook route and paid credits; verify its login endpoint and languages first); a second AI detector (GPTZero once its request/response fields are verified); a Hindi/Hinglish-aware grammar provider; brand profiles beyond Wisi Pay (rules per brand), export of the result as a ready-to-publish file, plagiarism and grammar API checks if the owner has keys, publishing to the site.
7. **Speed:** push instead of poll (needs a VPS with WebSockets or FCM), stream AI answers, cache frequent plans.
8. **More reflexes** (windows, screenshot to phone, type text, open file or folder, media keys), **several PCs online at once**, iPad and TV agents.
9. **Owner tools:** a Commands and Audit page, daily health report.

## 9. Changelog

| Date | Change |
|---|---|
| 2026-11-02 (live check + video script) | Full live check (table in section 7), `docs/VIDEO_SCRIPT.md`, stray test database removed from git. |
| 2026-11-02 (detector API) | **AI-detection provider:** Sapling adapter with Provider Settings (key saved outside the web root, honest states, consent, zero retention), per-detector results in the gate (no averaging), research notes on Copyleaks/GPTZero/Originality/ZeroGPT. Tests 349 to 390. |
| 2026-11-02 (CQO + Class) | **Content Quality & Originality gates** (owner's master rulebook): three strict gates, versions, evidence, 3 correction cycles, owner approval then publish authorisation, strict/review mode, LanguageTool grammar provider with consent, dashboard. **Language tutor (Class tab)**: trainer's class plan, daily lesson with diagram, speaking and writing practice with corrections, spaced-repetition quiz, progress, class reminders, American/British and other languages. Teaching method and CQO rules saved in the knowledge library. Schema v12 (additive). Tests 228 to 349. |
| 2026-11-02 | **Laptop keep-alive:** offline / back-online alerts (watchdog), agent loop survives stray errors, tray watchdog, keep-awake on mains power, `install_keepalive.ps1` for the Scheduled Task, app 1.2.6 (signed). The agent had been closed for days before this was noticed: nothing alerted anyone. Tests 208 to 228. |
| 2026-10-28 (content page) | **Content page** in the web app: brief form, history, result with copy buttons and report, "Dobara check", own-text check, rules editor (owner's copy kept outside the web root). Tests 181 to 208. |
| 2026-10-28 (later) | **Security fixes:** approvals for screen control and password typing, Pause switch, Ed25519 signed updates (key made, app 1.2.5 signed and installed), per-account lockout, 30-day agent tokens, security alerts, daily database backup. **Content Rules:** owner's rules file, checker, writer loop, content tasks. Tests 93 to 181. |
| 2026-10-28 | Device ID + password login for agents (`agent_login`), routing by device kind and speaking device, instant open-app/site/profile/Start-Menu reflexes, Google/Maps/YouTube search, volume, close app, Claude history reflex, 50 ms command pickup, Gemini thinking off, provider back-off, agent protections + audit log, on-screen banner/mouse glide, test suite (93 tests), deploy scripts, this document. |
| 2026-10-27 | Removed `g.php` and `api/test-db.php` from the hosting account (backup in `~/removed_20261027/`). |
| 2026-10-24 | Agent re-paired; server fixes deployed; Windows app 1.2.1/1.2.2 published; Chrome-profile launch; first live audit. |
| earlier | Operator layer (project memory, Chrome profiles, standing authority, `operate` loop, DPAPI vault, leads + calls), medical/exam library, Meri Library, knowledge playbooks, reflex layer, self-updating apps. |

## 10. Rules for whoever continues this work (human or AI)

1. Read sections 7 and 8 and `docs/SECURITY_PRIVATE.md` before starting; say which roadmap item you are working on.
2. Run `agent\venv\Scripts\python.exe tests\run_all.py` before and after a change. A new feature gets tests in the same change.
3. Deploy only through `deploy\deploy.ps1` (backup + lint + rollback). Never copy `config.php`, the database or `data/` into git.
4. When the work is done update: Status (7), Roadmap (8), Changelog (9), test counts (6), the file map (4) if files moved, and the private security file. Then publish the page again.
5. Bump `VERSION` in `agent/ops.py` together with the number in the server's `versions.json`, otherwise the app re-downloads itself every 30 minutes. Same for Android `versionCode`.

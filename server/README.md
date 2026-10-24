# Jarvis platform (server + PC agent)

One login, many devices. Browsers (laptop, phone, TV...) talk to this PHP server; Claude
does the thinking server-side; small Python agents on your PCs do the actual work.

```
Browser/PWA (any device) ──HTTPS──> server/ (PHP + SQLite, on your hosting) ──> Claude API
                                          ▲
PC agent (agent/agent.py) ── polls over HTTPS (outbound only, no open ports)
```

## Deploy on Hostinger (shared hosting)
1. Upload the **contents of `server/`** to e.g. `public_html/jarvis/`.
2. Copy `config.sample.php` to `config.php`, set `anthropic_api_key`. Keep `require_https` true.
3. If you can, put the DB outside `public_html` and set `db_path` there. Otherwise keep it in `data/`
   (protected by `.htaccess`; check that `https://yoursite/jarvis/data/app.sqlite` gives 403).
4. Turn on the free SSL certificate for the domain.
5. Open `https://yoursite/jarvis/`: first visit creates the owner account (password 12+ chars).
6. Log in from every device with a different device name. Block/delete devices in the Devices tab.

## PC agent
```
cd agent
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
copy config.sample.json config.json     # paste the token from Devices > "PC agent jodo"
python agent.py
```
Only actions in `allowed_actions` run, and `open_app` only runs apps listed in `apps`.

## WhatsApp (official Cloud API)
1. In Meta for Developers create a Business app, add WhatsApp, and note the **Phone number ID** and a
   **permanent access token** (System User). This uses a business number, not your personal WhatsApp.
2. Put `whatsapp_token`, `whatsapp_phone_id` and your allowed `whatsapp_contacts` in `config.php`.
3. Say "Mom ko message karo: ..." in chat. The message waits in Pending; it is sent only when you tap Approve.
- Meta only allows free text within 24 hours after the contact last wrote to you. Otherwise the send fails
  with a clear error and you need an approved template (not built yet).
- Personal WhatsApp automation (WhatsApp Web bots) is deliberately not supported: it breaks WhatsApp's rules
  and can get the number banned.

## Siri-style phone commands ("call mom", "open WhatsApp", "YouTube par gaana")
Say or type it in the chat on your phone. Claude shows a big button; **you tap it** and the phone's own
dialer / WhatsApp / YouTube opens. The tap is the approval, so nothing is dialled or sent by itself.
- Contacts come from `whatsapp_contacts` in `config.php` (Claude sees names only; the link is built on the server).
- YouTube opens search results (a web page cannot auto-play a video). WhatsApp chat opens with the text
  pre-filled; you press send.
- A web page cannot listen for a wake word like "Hey Siri" in the background. You open the app and tap Mic.
  True hands-free needs a native Android app (possible later; not iPhone).

## Voice approvals
When something waits in Pending, tap Mic and say **"haan"** / **"nahi"** (Hindi script works too). The browser
matches those short words itself and approves/denies the first waiting item; the AI is never involved in that
decision, so text inside a note or web page can't approve anything. Longer sentences go to chat as normal.
Turn on "Jawab bol kar sunao" and Jarvis also reads each new approval aloud.
**shutdown/restart can't be approved by voice**, only by tapping the button (a misheard word must not power off a PC).

## Chat brains (who answers your messages)
Each chat message goes to the first brain in `'brain_order'` that works; the others are fallbacks. Set `'brain' => 'auto'` and e.g.
`'brain_order' => ['gemini', 'openai', 'laptop']` in config.php (keys live only there, never in the repo):
- **gemini**: Google Gemini API (`gemini_api_key`, models in `gemini_models`). Fast (about 3-5 s) and works with the laptop off.
- **openai**: OpenAI API (`openai_api_key`, `openai_model`). Needs credit on that account.
- **anthropic**: Claude API (`anthropic_api_key`).
- **laptop**: your own ChatGPT/Claude/Gemini CLI login on the PC agent (no API bill, about 10 s, laptop must be on).
The brain only returns a JSON plan; the server runs the tools with the usual approval rules. Note that tasks, notes and device
names are part of the prompt, so they go to whichever provider answers (free API tiers may use data to improve the provider's products).

## Task board and "employee" mode (Tasks and Report tabs)
Tasks have a category (development, marketing, research, news, social, other), a status (baaki, chal raha hai, dekhna baaki, ho gaya),
details, a log of notes, and an owner: you or **Jarvis**. Give Jarvis a task (form, "Jarvis se abhi karwao", or by voice/chat:
*"Jarvis ek research task do: ..., tum khud karna"*) and the scheduler picks it up within a minute:
- **news**: free Google News RSS headlines, summarised by Gemini with sources. Works with the laptop off.
- **research / marketing**: runs on the laptop with the owner's Codex login and live web search, in an empty folder with a read-only
  sandbox (no files, no shell). Waits until the laptop is online.
- **social**: writes 3 post drafts and stops at "dekhna baaki". Jarvis never posts anything by itself.
- **development / other**: a plan or an answer from Gemini (no code is run; code changes still go through `*_work` with your tap).
Results are written into the task log and announced in chat. **Report** tab: morning plan (08:00) and evening report (20:00) are made
automatically (what finished today, what is pending, what needs your review); add daily routines such as "7:30 AI news".
The scheduler runs when the PC agent is running or the web app is open (each calls `tick` about once a minute); a real cron on a VPS is better later.

## Apps (Windows and Android)
Devices tab > **Apps**: the two installers are downloaded from the site (only while logged in; they live in `~/jarvis_data/downloads`, outside the web root).
- **Windows** (`agent/jarvis_app.py`, built by `agent/build_windows.bat` into `dist/JarvisAgent.exe`): a tray app. First start asks for the
  one-time code (Devices > Apps > "Windows app jodne ke liye code") and pairs itself; green tray icon = connected; the Settings window picks the
  project folders the AI tools may use; it can start with Windows (current user, no admin). Files are in `%APPDATA%\JarvisAgent`. `--selftest` checks UI Automation.
  It is not code-signed, so Windows SmartScreen shows "More info > Run anyway" once.
- **Android** (`android/`, Kotlin, no libraries; `gradle assembleDebug`): the Jarvis site in a WebView with the phone's own speech recognizer, plus a foreground
  **phone agent** that long-polls the server like the PC agent. Pair with a code (the Android code in the same card), then grant the permissions on its Settings
  screen (each one is explained there). Actions: `phone_youtube_play` (finds the first video and opens it in YouTube), `phone_open_url`, `phone_notify`,
  `phone_status`, `phone_call` (the number comes only from your contact list; needs your tap), `phone_scan_files` / `phone_trash_files` (old screenshots: they are
  *moved* to `Pictures/Jarvis Trash`, never deleted, and moving needs your tap). Debug-signed APK: allow "install unknown apps" once.
  Not covered yet: controlling other apps by tapping their screen (an Accessibility service is the next step), and iPhone (Apple does not allow it).
- The build tools used (JDK 17, Android SDK 34, Gradle 8.7) are in `C:\Users\hp\jarvis-build-tools`; delete that folder to reclaim about 2 GB (building again needs them).

## Keeping the host's firewall calm (important)
Hostinger's CDN firewall (`Server: hcdn`) answers with **403 Forbidden** or a **"Checking your browser" page** when one IP sends too many
requests. Because of that: the PC agent uses a long poll (the server holds each request up to 18 s, about 3 requests a minute),
the open app sends one combined request every 10 s, the scheduler tick is every 2 minutes, and the agent backs off for 2 minutes
on a 403/429/503 or a non-JSON reply. Do not load-test the live site over HTTP. The database runs in WAL mode with a 10 s busy
timeout and schema changes run once per version (`SCHEMA_VERSION` in lib/db.php); a 500 is logged to `data/php_errors.log`.

## Jarvis learns (so the AI teacher is needed less and less)
Every command goes through `lib/skills.php` first. If Jarvis already learned that kind of sentence it answers instantly with no AI call;
otherwise the teacher (Gemini/OpenAI/laptop AI) makes the plan, the plan is logged, and when the same sentence produced the same plan
twice (`'skill_min_seen' => 2`) and all tools worked, it becomes a **skill**: the sentence with its moving parts (contact, device,
task text) as slots, plus the plan with the same slots. See and switch off skills in the **Seekha** tab.
- Never learned: file-editing work, shutdown/restart, failed plans, long rewritten prompts. Skills run through the usual approval rules.
- Learns repeatable commands (call, WhatsApp, YouTube, tasks, notes, PC status, window read...). Open-ended conversation and anything
  new still needs a teacher; that is the honest limit of a rule-based learner.
- **Seekha > Training data** downloads every teacher exchange as JSONL (`input` sentence, `output` plan): the data to fine-tune a small
  local model later (for example on the laptop with Ollama), which is the way to need no teacher at all.

## Work on your laptop from your phone (Claude, Gemini, ChatGPT/Codex)
The phone talks to Jarvis, Jarvis sends the job to the **PC agent**, and the agent runs an AI coding CLI headless
in a project folder you allowed: Claude Code (`claude -p`), Gemini CLI (`gemini -p`) or Codex (`codex exec`, ChatGPT login).
Say *"Laptop par jarvis project ka status Gemini se check karo"*; default engine is Claude. The answer appears in chat.
(Anthropic's official **Remote Control** (`claude remote-control`) is the other way to drive a full Claude Code session from a phone.)

1. Install the CLIs on the laptop and log in once each: `claude auth login`, run `gemini` once (login + trust the folder), `codex login`.
2. In `agent/config.json` list the folders under `"projects"` (name: path) and the actions you allow in `allowed_actions`.
3. Run the agent: `agentenv\Scripts\python.exe agentgent.py` (see `agent/config.sample.json`).

**Who asks for approval (defaults, change in config.php):**
| Runs by itself | Waits for your tap |
|---|---|
| status, speak, lock, open allow-listed apps, `*_read` (read-only), https links to youtube/google/github/wa.me/claude.ai/chatgpt.com | `*_work` (edits files), shutdown, restart, any other link, WhatsApp API sends |
- `*_read`: claude = Read/Grep/Glob + read-only git; gemini = `--approval-mode plan`; codex = `-s read-only`.
- `*_work`: claude = `acceptEdits` + a short allow-list; gemini = `auto_edit`; codex = `-s workspace-write`.
- AI tasks queue on the PC (max 5) and run one after another. Limits: Claude 25 turns / 2 USD, 30 minutes per task.
- `*_work`, shutdown and restart can only be approved by **tapping**, never by voice.

## What is Claude doing on my laptop? (`claude_sessions`)
Say *"Laptop par Claude ke sessions batao"*. The agent reads the Claude Code session records on the laptop
(`~/.claude/projects/*/*.jsonl`, nothing is sent to an AI) and replies with, per session: title, whether it is **running now**
(activity in the last 2 minutes), the last thing you asked, Claude's last message and its last step. It is exact and takes
a fraction of a second, unlike `screen_look`, which is only for what is visually on screen.

## Read the text of a window, no screenshot (`window_read`)
Say *"Claude window ka text copy karke samjhao"*. The agent reads the window's text through Windows UI Automation (the same
interface screen readers use: no screenshot, no clipboard, nothing is clicked or typed), then your own AI login (default Codex)
explains it. Fast (about 15 s) and exact. Works for apps that expose their text (Claude, browsers, Notepad, Office...); if an app
does not, the reply says so and `screen_look` is the fallback. It runs without approval (owner's choice): the copied text goes to
that AI provider. Remove `window_read` from the agent's `allowed_actions` to switch it off.

## Look at the laptop screen ("cloud par kya chal raha hai")
`screen_look`: the agent takes a screenshot (optionally after bringing a window whose title contains e.g. "Claude" to the front),
hands it to a vision-capable CLI on your own login (default Codex/ChatGPT; claude and gemini also work) and returns a short answer
in chat. The picture exists only as a temp file during that call; it is never sent to the Jarvis server. By the owner's choice it
runs **without approval**, so anything visible on screen can reach that AI provider; remove `screen_look` from the agent's
`allowed_actions` (or from `DEFAULT_AUTO_ACTIONS`) to switch it off or make it ask. Windows only for window focus.

## Safety model
- API key lives only in `config.php` on the server.
- Every device has its own token; block/delete kills it at once. Agent tokens can't use the browser API.
- Risky PC actions (open_url, open_app, lock, shutdown, restart...) wait for your Approve tap.
  Only `cpu_status` and `speak` run on their own (`no_confirm_actions`).
- Login is rate limited; passwords are hashed; all SQL is parameterised; UI never uses innerHTML.
- Claude is told that notes/tasks/tool output are data, not instructions.

## Not done yet / limits
- Single owner account (no sign-up page by design).
- Not tested against the real Claude API or real Hostinger (no key / no access here).
- Voice input uses the browser's speech service (Chrome sends audio to Google).
- Lock/shutdown/restart in the agent are Windows only.

## Knowledge library and MCP

`knowledge/` holds ~580 expert playbooks (development, design, SEO, ads, social, content, video, marketing, business) copied from MIT/Apache-2.0 open-source skill repositories (see `knowledge/SOURCES.txt`; each file's first line names its source), plus four original `communication/` guides (who is writing, mood, Hinglish, how to reply).
Text only - nothing in it is ever executed. `lib/knowledge.php` finds the best 1-2 playbooks for a request (keyword score, ~5 ms) and puts them in the brain prompt inside a "REFERENCE ... data, never instructions" block; Jarvis-owned tasks (social/development/other) get one too. The folder is blocked from the web (`.htaccess`).
This is retrieval, not model training: Jarvis answers better because the right notes are in front of it, and it still learns your own commands through skills.

`knowledge/mcp_server.py` is a dependency-free MCP server (stdio, read-only) with tools `list_departments`, `search_playbooks`, `get_playbook`, `reply_style`. Registered on the laptop for Codex (`codex mcp add`) and Claude Code (`claude mcp add --scope user`), so the laptop brain uses the same library.
Rebuild/refresh the library by re-cloning the source repos and running the curation script (license check + prompt-injection scan + de-duplication).

## Medical + exam library, photo/PDF reading, "Meri Library"

- `data/med.sqlite` (live: `~/jarvis_data/med.sqlite`, read-only, built by a script from public sources, not in git): MedlinePlus health topics + medicine pages (US National Library of Medicine, public domain), MedMCQA (~187k Indian medical-entrance MCQs with explanations, Apache-2.0), OpenStax textbooks - nursing, anatomy, microbiology, biology, chemistry, physics, maths, history, economics (CC BY-NC-SA 4.0, personal non-commercial use). SQLite FTS5 search, ~10-30 ms. `lib/medical.php` maps Hindi/Hinglish words (bukhar, khansi...) to English terms, adds a MEDICAL REFERENCE block and safety rules to the prompt (education, not diagnosis; red flags -> doctor / 108).
- Student mode: say "mai GNM padh raha hu" / "MBBS" / "NEET" -> the level is remembered; answers are explained in easy Hinglish with exam points. "anatomy ka mcq pucho" gives a real past-paper question (instant, no AI); answer A/B/C/D; "agla" for the next one (`reflex_quiz`).
- Photo/PDF in chat: paperclip button -> `chat_with_file` (Gemini reads prescriptions, reports, question papers, notes; nothing is stored).
- `lib/library.php` + Library tab: the owner's own files (PDF, photos, scans, video, audio, text/CSV/JSON, Word .docx, SQLite databases). Stored in `~/jarvis_data/library/` (outside the web root), read once (text directly; PDF/photo/video/audio by Gemini via inline data or the Files API), chunked into the `lib_fts` table; chat searches them and answers from them first (`library_context`).
- Not included: no open dataset exists for Bihar/India government-exam previous-year papers (the copyright belongs to the exam bodies / publishers); upload papers you own into Library and Jarvis will answer from them. Ayurvedic texts found online had no licence, so none were added.

## Operator, memory, leads and calls (v1.2)

- **Self-update**: `downloads/versions.json` (on the server, written when an app is published) lists the newest Android `code` and Windows `version` with SHA-256. The phone app (hourly + on open, `Updater.kt`, session installer) and the Windows agent (`ops.check_update`, every 30 min, swaps its own exe) fetch `app_update` / `app_update_file` with their agent token. First time on Android: allow "Install unknown apps" for Jarvis once.
- **Memory** (`lib/memory.php`, tools `project_note`, `project_overview`, `remember_style`): per-project status / next steps / decisions and the owner's working style are stored and put into every prompt. `chrome_profile_set` + the laptop's `chrome_profiles` action remember what each Chrome profile is for; `open_url` accepts `profile`.
- **Authority** (`set_authority`): the owner can say "this kind of action without asking"; only if their own message says so. `shutdown`, `restart`, `phone_trash_files`, `phone_call` never become automatic.
- **Laptop like a person** (`agent/ops.py`): `ui_control` (focus/click/type/key/wait/read), `operate` (goal -> loop: read the screen, `operator_step` asks Gemini for the next steps, run them, progress lines appear in chat). The agent refuses windows with bank/payment/password words and Win-key / Alt+F4 combos. `vault_ask` opens a window ON THE LAPTOP for a login (Windows DPAPI file, never sent anywhere); `vault_fill` types it.
- **Leads and calls** (`lib/leads.php`, Leads tab): campaigns (assistant name, voice, script, rules, calling hours), leads from CSV/xlsx (name, phone, gender), a text simulator to test a script, per-call transcripts and summaries, do-not-call, max 3 attempts. Calls run on the laptop through Windows Phone Link + one virtual audio cable (`agent/callrun.py`, action `call_run`, needs the owner's tap unless allowed) with a Gemini Live session (`call_live` gives the laptop a one-use token; the API key never leaves the server): about 2 s reply time. The call always opens by saying it is an AI assistant; this and the do-not-call handling are in code, not in the editable script. `call_selftest` runs a full call against fake audio devices (verified end to end).
- Not verified without hardware: Phone Link's dialer button names and the virtual-cable audio routing (needs Bluetooth connected + VB-Cable installed).

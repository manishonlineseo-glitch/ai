# Jarvis — digital employee: system guide

> **Living document.** Read "7. Status" and "8. Roadmap" first. After every change update: Status, Changelog (section 9), test counts (section 6).
> Last updated: 2026-10-28. Security weaknesses and fixes are kept in `docs/SECURITY_PRIVATE.md` (not in git: this repository is public).

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
| `start_agent.bat`, `pair_agent.bat`, `build_windows.bat`, `JarvisAgent.spec` | Console start, login window, PyInstaller build → `dist/JarvisAgent.exe`. |

### Android app — `android/app/src/main/java/com/udaypurgroup/jarvis/`
`SettingsActivity` (login + permissions), `PhoneAgentService` (foreground service, long-poll), `ActionRunner` (YouTube play, call, open URL, notify, scan files), `Updater` (hourly check, SHA-256, silent install), `Prefs`, `Http`, `Notify`, `BootReceiver`, `MainActivity` (web view of the site).
Version: `versionCode 3 / 1.2` in `build.gradle.kts`. **Gradle is not installed on the dev PC, so the APK is built elsewhere (Android Studio).**

### Other
* `deploy/` — `deploy.ps1` (push + update server), `server-update.sh` (runs on the server: lint, backup, rsync, health check, rollback), `README.md`.
* `tests/` — `server_test.py`, `agent_test.py`, `live_smoke.py`, `run_all.py`, `last_run.json`.
* Repository root (`jarvis.py`, `news.py`, `Face-Recognition/` ...) — the original desktop Jarvis scripts, not part of this system.
* `server/knowledge/` — playbooks + `mcp_server.py` (knowledge MCP server).

## 5. Approval model

Small, reversible actions run by themselves (`open_app open_url(known domains) volume lock cpu_status claude_sessions window_read web_research screen_look ui_control operate vault_*`).
Anything that edits files, powers off, closes programs, calls someone, or opens an unknown link waits in **Pending** for the owner's tap (`command_decide`).
The agent also refuses to type or click in windows whose title looks like a bank, payment or password manager (`ops.SENSITIVE`) and refuses dangerous key combos.

## 6. Testing

| Suite | Command | Tests | What it covers |
|---|---|---|---|
| `tests/server_test.py` | `agent\venv\Scripts\python.exe tests\run_all.py` | **49** (+33 sub-checks) | Fresh setup, device IDs (create, duplicate, weak password), agent login, session replacement, password change signs agent out, delete device ID, agent not blockable / online agent not deletable, audit log, 28 routing sentences (laptop vs phone, profiles, apps, YouTube, search, volume, history), 5 sentences that must NOT be hijacked, speed (< 1.5 s each), offline laptop answer, approvals (approve / deny / agent cannot approve itself), command lifecycle, long-poll wake-up, chat rate limit, bad input, SQL-injection strings, brute-force lockout, CSRF header. Runs against a throw-away copy of `server/` with its own database. |
| `tests/agent_test.py` | same | **33** | Built-in apps, Start Menu search (exact/prefix/contains, no uninstallers, path tricks), Chrome profile matching (exact beats longer name, email, last-used, unknown), DPAPI password round trip, config rules, volume keys, close-app never force-kills, `open_url` only http/https, version compare, sensitive-window and key-combo guards, **re-login against the real server code** (ok / wrong password / server down / corrupt password). |
| `tests/live_smoke.py` | `... run_all.py --live` | **11** | The public live site without a password: HTTPS, redirect, security headers, config/db/log files not public, removed backdoor files stay gone, agent/owner routes need auth, neutral wrong-password answer, setup closed, new code deployed. |

Last full run: **2026-10-28 — 93 tests, 33 sub-checks, 0 failures** (`tests/last_run.json`). Bugs the tests found and that were fixed the same day: song request "baja do" fell to the slow AI;
"awaaz badhao" ignored when spoken from the phone; "chrome kholo aur google search karo" was cut to a Google search; the agent counted a network error as a wrong password.
Measured: chat → queued median 16 ms (max 33); queued → agent poll returns median 163 ms (before the 50 ms poll step).
**Not tested:** a real command from the Android app to the live server (needs the owner's password), the Android app itself, the on-screen banner during a real task, Windows autostart after a reboot, behaviour with 2+ PCs online, load. There is no CI yet — tests run by hand.

## 7. Status (2026-10-28)

**Done and working**
* Device ID + password for every device; agent sign-in without codes; auto re-login (Windows code + Android code written).
* Instant reflex layer for the everyday commands; device chosen from the words or the speaking device; single-agent fallback.
* Chrome opens straight into the named profile ("chrome open kro udaypur"); any Start Menu program opens by name.
* Fast brain: Gemini flash-lite/flash with thinking off; failing providers skipped.
* On-screen banner + visible mouse movement while the agent works on screen.
* Auto-update of the Windows app (published 1.2.3; 1.2.4 built with these changes); Android updater code present.
* Deploy by `git pull` with backup and rollback; GitHub repo `manishonlineseo-glitch/ai` (public).
* 93 automated tests.

**Written but not finished / not verified**
* Android APK with the new login is **not built** (needs Android Studio/Gradle); phones still run the old pairing-code APK.
* The laptop's own saved login (username/password in the tray app) has to be entered once by the owner; until then it runs on its old token.
* No real mobile → live server → laptop test has been run by Claude (no owner password available).
* Gemini/OpenAI: OpenAI has no credits; the chain therefore is Gemini → laptop AI.

## 8. Roadmap (next work, in order)

1. **Security first** — see `docs/SECURITY_PRIVATE.md` (rotate secrets, sign the auto-updates, approvals for screen control, private repo, per-account lockout, backups).
2. **Build and ship the Android APK** (versionCode 3), publish to `jarvis_data/downloads` + `versions.json`, then delete the old pairing routes.
3. **Keep the laptop agent alive:** Task Scheduler autostart + restart on failure, a phone notification when the laptop goes offline, sleep settings.
4. **CI:** GitHub Actions running `tests/run_all.py` on every push; deploy only when green.
5. **Speed:** push instead of poll (needs a VPS with WebSockets/SSE or FCM for the phone), AI answers streamed, cache frequent plans, move off shared hosting.
6. **More reflexes:** close/minimise windows, screenshot to phone, type text into the active window, open a file/folder by name, media keys, brightness, Wi-Fi.
7. **Multi-device:** several PCs online (name routing exists, untested), iPad/TV agents (only phone and PC agents exist today).
8. **Owner tools:** a Commands/Audit page (who asked what, which device, result, time), an offline-agent alert, daily health report.

## 9. Changelog

| Date | Change |
|---|---|
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

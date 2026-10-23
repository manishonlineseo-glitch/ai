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

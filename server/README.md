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

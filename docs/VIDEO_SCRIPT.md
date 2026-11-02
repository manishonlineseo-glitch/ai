# Jarvis video script (Hinglish) — "Maine apna Digital Employee banaya"

Based on `docs/SYSTEM.md` (status 2026-11-02). Every number below was measured or checked on that date; where something is NOT done or NOT tested the script says so, on purpose: the video should never promise more than the system does.
Languages: voice-over in Hinglish, on-screen text in simple English/Hinglish. Length: **main video 9–10 minutes**, plus a **60-second teaser** and **5 Shorts** (section 9).

---

## 0. Before you record (checklist)

| Do this first | Why |
|---|---|
| Run `powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\ai\agent\install_keepalive.ps1` once | so the laptop agent restarts by itself (not done yet on 2026-11-02) |
| Tray icon → Settings → "Dobara login karo" with the laptop's Device ID | so the app signs in by itself (still on its old token) |
| Create a free Sapling key → Content → Provider Settings → Save → Test connection | needed for the "AI check" scene (real scan with a real key has NOT been done yet) |
| Build and install the new Android APK (Android Studio, `versionCode 3`) | the phone demos need the phone app; the old APK still uses codes |
| Make 2–3 demo Device IDs ("Demo Laptop", "Demo Phone") with throw-away passwords | never film real passwords, keys, tokens or the owner login |
| Make one demo learner ("Rahul", test data) | the Class tab has not been used with a real learner yet |
| Close other tabs, hide bookmarks, turn off notifications, 1080p, zoom the page to 125% | readable on phones |
| Screen-record the laptop and the phone at the same time (two files) | the "phone → laptop" moment is the star of the video |

**Never show:** `config.php`, Provider key field with a real key, `%USERPROFILE%\.jarvis_signing`, SSH, the Hostinger panel, `docs/SECURITY_PRIVATE.md`, real customer chats or leads.

---

## 1. Fact sheet (use only these claims)

| Claim | Number / fact | Where it comes from |
|---|---|---|
| Everyday command speed | server work **16 ms**; command reaches the laptop in **~0.05–0.2 s**; Chrome starts in 0.2–0.5 s; whole thing **roughly 0.5–1 s** | measured 2026-10-28 (local server) + 150 ms network |
| One AI call | about **2 s** (Gemini flash-lite, thinking off; it was 14 s with thinking on) | timed on the live server |
| Tests | **390** automated tests (379 offline + 11 on the live site), all passing | `tests/last_run.json` |
| Devices | each device has its own username/password; change it any time; no pairing codes | `docs/SYSTEM.md` §3 |
| Updates | the Windows app installs an update only if it carries the owner's Ed25519 signature | tested (valid, unsigned, wrong key, swapped file) |
| Backups | database copy every day, checked, last 14 kept | live: 3 backups, newest 17 h old on 2026-11-02 |
| Content checks | ~30 measured checks; 4 of 4 real live runs passed all required checks in 2–4 rounds (11–86 s) | 2026-10-28 |
| Grammar provider | LanguageTool (real call: 33-word sample scored 89.4) | 2026-11-02 |
| AI detector | Sapling adapter built; **real scan with a real key NOT done yet** | say so in the video |
| Class tab | real lesson in **4.3 s**, real correction in **3.1 s**; **no real learner has used it yet** | 2026-11-02 |

**Do NOT say:** "passes ZeroGPT", "100% human", "undetectable", "plagiarism checked automatically" (plagiarism results are typed in by the owner), "works for Hindi grammar" (Hindi/Hinglish are NOT verified by the grammar or AI providers), "unhackable", "fully secure" (the hosting account was compromised once; secrets still have to be rotated).

---

## 2. Main video — scene by scene (9–10 min)

### Scene 1 — Hook (0:00–0:25)
**Visual:** phone in hand, laptop on the desk behind it. Phone screen: say/type *"laptop ka chrome kholo udaypur"*. Cut to the laptop: Chrome opens straight into the "udaypur" profile — one second later. Slow-motion replay with the stopwatch overlay "≈ 1 second".
**Voice-over:** "Mobile se ek line boli… aur laptop par Chrome apne aap khul gaya. Ye mera apna digital employee hai: Jarvis. Aaj main dikhaunga ye kaise bana, kya kar sakta hai, aur kya abhi nahi kar sakta."
**On-screen text:** JARVIS — mera digital employee

### Scene 2 — Kya hai ye? (0:25–1:10)
**Visual:** simple animated diagram: phone, tablet, TV, laptop → one cloud "Jarvis server" → arrows to each device.
**Voice-over:** "Idea simple hai. Main kisi bhi device se bolta hoon — Hindi, Hinglish ya English. Jarvis samajhta hai ki *kya* karna hai aur *kis device par*. Phir wahi device kaam karta hai. Mujhe lagta hai jaise mere har device ke paas haath hain."
**On-screen text:** Bolo → Samjho → Sahi device par karo

### Scene 3 — Live demo: tez commands (1:10–2:40)
Film these five in a row, phone on one side of the split screen, laptop on the other (use the exact phrases):
1. *"laptop par code kholo"* → VS Code opens.
2. *"youtube par arijit singh ka gaana chalao"* (from the phone → plays on the phone; from the laptop browser → opens YouTube results on the laptop).
3. *"laptop ki awaaz kam karo"* → volume bar moves.
4. *"google par udaipur ke best cafe search karo"* → Google results open.
5. *"claude par kya chal raha hai"* → the answer arrives in chat with the list of Claude Code sessions.
**Voice-over:** "Dhyan do — in commands ke liye koi AI call nahi lagti. Rules se samajh liye jaate hain, isliye server ko sirf 16 millisecond lagte hain. Jis device ka naam bolo, wahi chalta hai. Naam na bolo to wo device jis se main baat kar raha hoon."
**On-screen text:** 16 ms · koi AI call nahi · device ka naam bolo ya default

### Scene 4 — Andar kya chalta hai (2:40–4:00)
**Visual:** the 9-step diagram from `docs/SYSTEM.md` §2, animated step by step (phone → server → reflex → AI only if needed → queue → laptop agent → result). Overlay the real numbers.
**Voice-over:** "Pehle server rules try karta hai. Rule na mile to ek AI se poochta hai — usme lagbhag 2 second. Phir command ek queue me jaati hai. Laptop par ek chhoti app har kuch millisecond me poochti hai ‘kuch kaam hai?’ — aur kaam turant utha leti hai. Kaam hone ke baad sachcha result wapas chat me aata hai — jhootha ‘ho gaya’ nahi."
**On-screen text:** Reflex 16 ms → AI ~2 s → Queue → Agent → Result

### Scene 5 — Har device ka apna login (4:00–4:50)
**Visual:** web app → Devices → "+ Naya device ID". Fill demo values (name, type Laptop/Android/iPad, username, password). Then open the laptop app login window and sign in.
**Voice-over:** "Pehle code wala tareeka tha, ab har device ka apna username aur password. Naya device banate waqt bas batao ki ye *kis device ke liye* hai — baaki system khud samajh leta hai. Password badalna ho to Edit — device apne aap naye password se login ho jata hai."
**On-screen text:** Har device = apna ID + password · koi code nahi

### Scene 6 — Jarvis kaam dikhata hai (4:50–5:30)
**Visual:** run a multi-step task ("laptop par notepad kholo aur ye likho"). Show the green banner at the top of the screen, the mouse gliding, the red ring at each click.
**Voice-over:** "Jab Jarvis screen par kaam karta hai to mouse kood-kood kar nahi jata. Upar banner dikhta hai ki kya kar raha hai, mouse aaram se chalta hai, aur har click par laal ring aati hai. Bank ya password wali window me wo kuch type ya click hi nahi karta."
**On-screen text:** Banner + mouse + ring · bank/password windows band

### Scene 7 — Safety (5:30–6:40)
**Visual:** quick cuts — an Approve card ("operate" waits for a tap), the PAUSE button on the Devices page, a phone notification "Laptop offline ho gaya", the backups line, the update refusing an unsigned file (terminal output from the tests).
**Voice-over:** "Risky kaam apne aap nahi chalte: screen control aur password bharna meri Approve ke baad. Ek emergency PAUSE button hai jo sab devices rok deta hai. Naya app tabhi install hota hai jab uspar meri digital signature ho — server hack ho jaye tab bhi koi gandi app mere laptop par nahi chalegi. Koi device offline ho to phone par alert aata hai. Aur database ka roz backup. *Lekin* — main ye nahi kahunga ki ye 100% safe hai. Mera hosting account pehle ek baar compromise hua tha, isliye maine saare passwords aur keys badalne ka kaam baaki rakha hai."
**On-screen text:** Approve · Pause · Signed updates · Alerts · Backups — aur honest: "abhi sab keys badalni baaki hain"

### Scene 8 — Content engine (6:40–8:00)
**Visual:** web app → Content. Fill the brief (topic, focus keyword, brand, language). Show the draft arriving, then the check report (green/red lines with real numbers). Open Quality Gate: Grammar (LanguageTool), AI detection (Sapling or the typed-in ZeroGPT number), Plagiarism (typed-in), versions list, owner approval buttons.
**Voice-over:** "Content ke liye mere apne rules hain: Yoast SEO, readability, aur human-written. Jarvis likhta hai, program 30 cheezein naapta hai — title ki length, keyword kahan hai, sentences kitne lambe, transition words — aur jo fail ho use sudhaarta hai. Ab teen gate: grammar 85 se upar, AI detector 8 se neeche, plagiarism bilkul zero. Agar koi jaanch hui hi nahi, to status ‘NOT VERIFIED’ — kabhi nakli score nahi. Har draft ek version hai, purana kabhi delete nahi hota. Aur publish tabhi jab main khud do baar haan bolun — aur tab bhi Jarvis kahin kuch bhejta nahi."
**Say honestly:** "Plagiarism ka number main apne checker se daalta hoon. AI detector ke liye Sapling joda hai — uski asli key ke saath pehli jaanch main is video ke baad karunga." (change this line if you have done it.)
**On-screen text:** 3 gates · NOT VERIFIED agar jaanch nahi hui · versions · owner approval

### Scene 9 — Class tab: gaon ka ladka English seekhe (8:00–9:20)
**Visual:** Class tab → "+ Naya learner": show the trainer questions (kaun, level, class time, kitne minute, American/British, goal). Open today's class: theme, the diagram (Subject + Verb + Object), the 10 words with Hindi meaning, Suno / Bolo buttons, a written sentence with the correction, the 4-choice revision, the progress chart.
**Voice-over:** "Maine ek aur skill jodi: koi bhi gaon ka ladka English seekh sake — saral bhasha me. Pehle trainer se poochta hai: class kis time, kitne minute. Phir roz 10 aasaan, roz ke shabd, bolna, likhna, galti sudhaar — Hindi me samjhaakar. American ya British, aur French, German jaisi koi bhi bhasha. Purane shabd 1, 2, 4, 8, 16 din baad phir poochhe jaate hain, taaki yaad rahe."
**Say honestly:** "Ye abhi test data se dikha raha hoon — asli learner ke saath pehli class abhi baaki hai." Real timings you may quote: lesson 4.3 s, correction 3.1 s.
**On-screen text:** Roz naya lesson · Bolo · Likho · Revision · Progress

### Scene 10 — Bharosa: tests aur deploy (9:20–9:50)
**Visual:** terminal: `agent\venv\Scripts\python.exe tests\run_all.py --live` finishing with 390 tests, all OK. Then `deploy\deploy.ps1` (backup, syntax check, health check).
**Voice-over:** "Ye sab bina test ke nahi hai: 390 automated tests, aur har update se pehle backup, syntax check, aur agar site na chale to apne aap purana version wapas."
**On-screen text:** 390 tests ✓ · backup · rollback

### Scene 11 — Aage kya (9:50–10:20)
**Visual:** the roadmap list (Android app, 2FA, plagiarism API, more commands, push instead of polling).
**Voice-over:** "Abhi baaki hai: naya Android app, plagiarism ke liye asli API, do-step login, aur zyada commands. Agar aap bhi apna digital employee banana chahte ho, comment me batao ki kaunsi skill pehle chahiye."
**CTA:** comment · subscribe · (link to the written guide if you publish it)

---

## 3. 60-second teaser (vertical)
1. 0–5 s: phone says "laptop ka chrome kholo" → Chrome opens. Text: "1 second".
2. 5–15 s: five commands in rapid cuts (code, youtube, volume, google, claude history).
3. 15–25 s: Pause button / Approve card. Text: "Risky kaam = meri Approve".
4. 25–40 s: Content gates with red and green checks. Text: "Jaanch nahi hui = NOT VERIFIED".
5. 40–52 s: Class tab diagram + Bolo button. Text: "Gaon ka ladka bhi English seekhe".
6. 52–60 s: "390 tests ✓ — full video channel par".

## 4. Shot list (what to screen-record, in order)
1. Phone chat → laptop Chrome profile opens (split screen).
2. The five demo commands (section 2, scene 3).
3. Devices page: new Device ID form; laptop app login window.
4. A screen task with banner + mouse glide + ring.
5. Approve card; PAUSE button; offline alert notification on the phone.
6. Content: brief form → draft → check report → Quality Gate → versions → approval buttons.
7. Provider Settings page (key field empty or masked; never a real key).
8. Class tab: trainer form, lesson, diagram, Suno/Bolo, correction, quiz, progress chart.
9. Terminal: 390 tests passing; `deploy.ps1` output.
10. Diagrams to animate: request flow (SYSTEM.md §2), three gates, Leitner boxes (1, 2, 4, 8, 16 days).

## 5. Titles, thumbnails, description
**Title options:** "Maine apna Digital Employee banaya (Jarvis) — mobile se laptop control" · "1 second me laptop control: AI Digital Employee" · "Gaon ka ladka English seekhe: AI teacher bana diya"
**Thumbnail:** phone + laptop split, big text "1 SECOND", small text "Mera Digital Employee".
**Description (draft):** "Mobile se bolo, laptop par kaam ho. Is video me: tez commands, har device ka apna login, safety (Approve, Pause, signed updates), content ke liye 3 quality gates, aur English seekhne wala Class tab. Jo abhi baaki hai wo bhi bataya hai."
**Chapters:** 0:00 Hook · 0:25 Kya hai · 1:10 Demo · 2:40 Andar kya chalta hai · 4:00 Device login · 4:50 Screen par kaam · 5:30 Safety · 6:40 Content · 8:00 Class tab · 9:20 Tests · 9:50 Aage kya
**Hashtags:** #AI #DigitalEmployee #Automation #Hinglish #Python #PHP

## 6. Disclaimers to put on screen once
- "Speed numbers were measured on 2026-10-28/11-02; your network changes them."
- "Content tools check grammar/AI-likeness/plagiarism with real providers or numbers typed in by the owner. No tool can guarantee a result on another detector."
- "The Class tab demo uses test data."

## 7. Voice style
Short sentences, one idea each, everyday words ("kaam", "jaanch", "bharosa"), no jargon without a one-line explanation, say the real numbers, say what is not done. Pace: calm, 130–150 words per minute.

## 8. Update rule
When the system changes, update the fact sheet (section 1), the "not done yet" lines and the checklist (section 0) before recording again, and add the change to `docs/SYSTEM.md` (Changelog).

## 9. Five Shorts (each 30–45 s)
1. "Mobile → laptop in 1 second" (scene 1 + five commands).
2. "AI jo kehta hai ‘NOT VERIFIED’" (content gates: no fake scores).
3. "Pause button" (emergency stop + Approve card).
4. "Gaon ka ladka English seekhe" (Class tab: word, diagram, Bolo).
5. "390 tests, 0 failures" (terminal + deploy rollback story).

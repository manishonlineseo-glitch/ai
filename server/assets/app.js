'use strict';

const root = document.getElementById('app');
const TYPE_LABEL = {
  laptop: 'Laptop', home_desktop: 'Home desktop', tv: 'TV', android: 'Android mobile',
  iphone: 'iPhone', work_android: 'Work Android', work_iphone: 'Work iPhone', other: 'Other',
};
const ICONS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  send: 'M12 19V5M5 12l7-7 7 7',
  clip: 'M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  speaker: 'M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
};
const CHIPS = ['Mom ko call karo', 'YouTube par gaana lagao', 'Mere tasks dikhao', 'Home-PC ka CPU kaisa hai?'];

// ---------- helpers (text always goes through textContent, never innerHTML) ----------
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v; // CSSOM is allowed by our CSP; style="" attributes are not
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name]);
  s.append(p);
  return s;
}

async function api(route, body) {
  const opt = { headers: { 'X-Requested-With': 'jarvis' } };
  if (body !== undefined) {
    opt.method = 'POST';
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch('api.php?r=' + route, opt);
  const j = await r.json().catch(() => ({ error: 'Server ne galat jawab diya' }));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error ' + r.status), { status: r.status });
  return j;
}

function guessType() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return /TV|AFT|BRAVIA/i.test(ua) ? 'tv' : 'android';
  if (/SmartTV|Tizen|WebOS|BRAVIA/i.test(ua)) return 'tv';
  return 'laptop';
}

function typeSelect(value) {
  return h('select', { name: 'device_type', 'aria-label': 'Device type' }, Object.entries(TYPE_LABEL).map(
    ([k, v]) => h('option', { value: k, selected: k === value }, v)));
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return 'abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  return Math.floor(s / 86400) + ' din pehle';
}

// ---------- preferences (per device, only a convenience) ----------
let prefs = { speak: false, lang: 'hi-IN' };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem('jv_prefs') || '{}') }; } catch (_) { /* private mode */ }
function savePrefs() { try { localStorage.setItem('jv_prefs', JSON.stringify(prefs)); } catch (_) { /* ignore */ } }

/** Speaks `text` when the speaker toggle is on, or always when `force` (the question was spoken). The app uses the phone's own voice. */
function speak(text, force) {
  if (!force && !prefs.speak) return;
  text = String(text).split('\n\n•')[0].replace(/https?:\/\/\S+/g, '').trim();
  if (!text) return;
  if (window.JarvisNative && JarvisNative.speak) { JarvisNative.speak(text, prefs.lang); return; }
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = prefs.lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- voice ----------
// In the Android app the page uses the phone's own speech recognizer through window.JarvisNative (a WebView has no
// webkitSpeechRecognition); in a normal browser it uses the browser's.
const NATIVE = !!(window.JarvisNative && JarvisNative.available && JarvisNative.available());
const SR = NATIVE ? true : (window.SpeechRecognition || window.webkitSpeechRecognition);
let activeRec = null;

function listen(onText, onEnd) {
  if (!SR) return null;
  if (NATIVE) {
    let done = false;
    const finish = () => { if (done) return; done = true; activeRec = null; onEnd(); };
    window.onNativeSpeech = (text) => { onText(text); finish(); };
    window.onNativeSpeechEnd = finish;
    activeRec = { stop: () => JarvisNative.stop() };
    JarvisNative.listen(prefs.lang);
    return activeRec;
  }
  const r = new SR();
  r.lang = prefs.lang;
  r.interimResults = false;
  r.onresult = (e) => onText(e.results[0][0].transcript);
  const end = () => { activeRec = null; onEnd(); };
  r.onend = end;
  r.onerror = end;
  activeRec = r;
  r.start();
  return r;
}

const YES = ['haan', 'han', 'haa', 'ha', 'yes', 'yeah', 'ok', 'okay', 'theek hai', 'kar do', 'kar de', 'bhej do', 'bhej de',
  'approve', 'approve kar do', 'chalao', 'हाँ', 'हां', 'हा', 'कर दो', 'कर दे', 'भेज दो', 'भेज दे', 'ठीक है', 'ओके', 'अप्रूव', 'चलाओ'];
const NO = ['nahi', 'nahin', 'nahi karo', 'no', 'cancel', 'deny', 'mat karo', 'mat bhejo', 'rehne do', 'ruko', 'stop',
  'नहीं', 'नही', 'मत करो', 'मत भेजो', 'रहने दो', 'रुको', 'कैंसल'];

function verdict(text) {
  const t = ' ' + text.toLowerCase().replace(/[.,!?।"'‘’“”]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (t.trim().split(' ').length > 4) return null; // long sentences are normal chat, not an answer
  const has = (list) => list.some((p) => t.includes(' ' + p + ' '));
  const y = has(YES), n = has(NO);
  return y && !n ? 'yes' : n && !y ? 'no' : null;
}

/** Spoken "haan"/"nahi" for the first waiting approval. Decided here in the browser, never by the AI. */
async function tryVoiceDecision(text) {
  if (!pendingList.length) return false;
  const v = verdict(text);
  if (!v) return false;
  const item = pendingList[0];
  if (v === 'yes' && item.danger) {
    note('Ye risky hai (files badalna / shutdown). Screen par Approve tap karo.');
    return true;
  }
  await decide(item.route, item.id, v === 'yes');
  note((v === 'yes' ? 'Approve kiya: ' : 'Cancel kiya: ') + item.spoken);
  return true;
}

// ---------- auth screen ----------
function showCodeLogin() {
  const err = h('div', { class: 'error', role: 'alert' });
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        await api('pair_login', { code: new FormData(form).get('code') });
        boot();
      } catch (x) { err.textContent = x.message; }
    },
  },
    h('label', { for: 'pc' }, 'Device code (jaise K7M2-9QXA)'),
    h('input', { id: 'pc', name: 'code', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 12, required: true, style: 'font-size:1.4rem;letter-spacing:.15em;text-align:center' }),
    err,
    h('button', { type: 'submit', style: 'width:100%' }, 'Is device ko jodo'),
    h('button', { type: 'button', class: 'ghost', style: 'width:100%;margin-top:8px', onclick: () => showAuth(false) }, 'Username/password se login'));
  root.replaceChildren(h('div', { class: 'auth' },
    h('h1', { class: 'serif' }, 'Jarvis'),
    h('p', { class: 'muted' }, 'Owner ke Devices tab me "Naya device jodo" se code banta hai. Wo code 15 minute me ek hi baar chalta hai.'),
    h('div', { class: 'card' }, form)));
}

function showAuth(setup) {
  const err = h('div', { class: 'error', role: 'alert' });
  const type = guessType();
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        await api(setup ? 'setup' : 'login', Object.fromEntries(new FormData(form)));
        boot();
      } catch (x) { err.textContent = x.message; }
    },
  },
    setup && state.setup_key_required ? [
      h('label', { for: 'sk' }, 'Setup key (server ki config.php me hai)'),
      h('input', { id: 'sk', name: 'setup_key', autocomplete: 'off', required: true }),
    ] : null,
    h('label', { for: 'u' }, 'Username'),
    h('input', { id: 'u', name: 'username', autocomplete: 'username', required: true }),
    h('label', { for: 'p' }, setup ? 'Password (kam se kam 12 akshar)' : 'Password'),
    h('input', { id: 'p', name: 'password', type: 'password', autocomplete: setup ? 'new-password' : 'current-password', required: true, minlength: setup ? 12 : 1 }),
    setup ? null : h('p', { class: 'muted' }, 'Device ID se login kar rahe ho to neeche naam/type ignore hote hain; Devices tab wala naam use hota hai.'),
    h('label', { for: 'dn' }, 'Is device ka naam'),
    h('input', { id: 'dn', name: 'device_name', value: TYPE_LABEL[type], maxlength: 40, required: true }),
    h('label', null, 'Device type'),
    typeSelect(type),
    err,
    h('button', { type: 'submit', style: 'width:100%' }, setup ? 'Account banao' : 'Login'),
    setup ? null : h('button', { type: 'button', class: 'ghost', style: 'width:100%;margin-top:8px', onclick: showCodeLogin }, 'Device code se jodo'));
  root.replaceChildren(h('div', { class: 'auth' },
    h('h1', { class: 'serif' }, 'Jarvis'),
    h('p', { class: 'muted' }, setup ? 'Pehli baar setup: apna owner account banao.' : 'Login karo. Har device alag se register hota hai.'),
    h('div', { class: 'card' }, form)));
}

// ---------- shell ----------
let state = null;
let tab = 'chat';
let timer = null;
let kicking = false;
/** Ask the server to run whatever is due (reports, routines, tasks given to Jarvis). Fire and forget, one at a time. */
function kickScheduler() {
  if (kicking) return;
  kicking = true;
  api('tick').catch(() => {}).finally(() => { kicking = false; });
}
let pendingList = [];
const announced = new Set();
let noteHook = null;

const TABS = [['chat', 'Chat'], ['tasks', 'Tasks'], ['report', 'Report'], ['notes', 'Notes'], ['devices', 'Devices'], ['skills', 'Seekha'], ['library', 'Library'], ['leads', 'Leads'], ['center', 'Command Center'], ['content', 'Content'], ['learn', 'Class']];

function note(text) {
  if (noteHook) noteHook(text);
  speak(text);
}

function showApp() {
  const side = h('aside', { class: 'side', id: 'side' },
    h('div', { class: 'brand serif' }, 'Jarvis'),
    TABS.map(([id, label]) => h('button', {
      class: 'nav', 'data-tab': id, onclick: () => { tab = id; closeSide(); renderView(); },
    }, label)),
    h('div', { class: 'side-foot' },
      h('div', { class: 'muted' }, state.user + ' · ' + state.device.name),
      h('div', { class: 'row' },
        h('input', { type: 'checkbox', class: 'check', id: 'spk', checked: prefs.speak,
          onchange: (e) => { prefs.speak = e.target.checked; savePrefs(); if (!prefs.speak) speechSynthesis.cancel(); } }),
        h('label', { for: 'spk' }, 'Jawab bol kar sunao')),
      h('select', { 'aria-label': 'Voice language', onchange: (e) => { prefs.lang = e.target.value; savePrefs(); } },
        h('option', { value: 'hi-IN', selected: prefs.lang === 'hi-IN' }, 'Hindi'),
        h('option', { value: 'en-IN', selected: prefs.lang === 'en-IN' }, 'English')),
      h('button', { class: 'ghost small', style: 'margin-top:8px;width:100%', onclick: async () => { await api('logout', {}); boot(); } }, 'Logout')));
  const scrim = h('div', { class: 'scrim', id: 'scrim', onclick: closeSide });

  root.replaceChildren(h('div', { class: 'shell' }, side, scrim,
    h('main', { class: 'main' },
      h('header', { class: 'bar' },
        h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menu', onclick: () => { side.classList.add('open'); scrim.classList.add('show'); } }, icon('menu')),
        h('span', { class: 'title', id: 'title' })),
      h('div', { class: 'view', id: 'view' }))));
  renderView();
  clearInterval(timer);
  timer = setInterval(tick, 10000); // one combined request per 10 s while the page is visible
  setInterval(kickScheduler, 120000);
  setTimeout(kickScheduler, 3000);
}

function closeSide() {
  document.getElementById('side').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
}

function renderView() {
  clearInterval(contentTimer);
  noteHook = null;
  hud = null;
  refreshTasks = null;
  devicesBox = recentBox = null;
  document.querySelectorAll('.nav').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  document.getElementById('title').textContent = TABS.find(([id]) => id === tab)[1];
  const view = document.getElementById('view');
  view.replaceChildren();
  ({ chat: viewChat, tasks: viewTasks, report: viewReport, notes: viewNotes, devices: viewDevices, skills: viewSkills, library: viewLibrary, leads: viewLeads, center: viewCenter, content: viewContent, learn: viewLearn })[tab](view);
  tick();
}

function page(view, ...kids) {
  const wrap = h('div', { class: 'page' }, h('div', { class: 'col' }, h('div', { id: 'pending' }), kids));
  view.append(wrap);
}

// ---------- polling + approvals ----------
async function tick() {
  if (document.hidden || !state) return;
  try {
    const { commands, messages, status } = await api('commands' + (hud ? '&hud=1' : ''));
    renderPending(commands, messages || []);
    announceFinished(commands);
    announceProgress(commands);
    if (hud && status) hud.update(status);
    if (tab === 'devices') { renderRecent(commands); loadDevices(); }
    if (tab === 'tasks' && refreshTasks) refreshTasks();
  } catch (x) { if (x.status === 401) boot(); }
}

function describe(c) {
  const a = c.args || {};
  if (AI_ACTION.test(c.action)) {
    const [engine, mode] = c.action.split('_');
    return ENGINE_LABEL[engine] + (mode === 'work' ? ' kaam (files badal sakta hai)' : ' padhai (read-only)') +
      ' · ' + c.device + ' · project ' + a.project + (a.continue ? ' · pichla session jaari' : '') + '\n' + a.prompt;
  }
  if (c.action === 'operate') return 'Laptop par kaam: ' + (a.goal || '') + ' · ' + c.device;
  if (c.action === 'ui_control') return 'Laptop par click/type (' + ((a.ops || []).length) + ' steps) · ' + c.device;
  if (c.action === 'claude_sessions') return 'Claude sessions dekho · ' + c.device;
  if (c.action === 'window_read') {
    return 'Window ka text padho · ' + c.device + (a.window ? ' · window: ' + a.window : ' · aage wali window') + (a.question ? '\n' + a.question : '');
  }
  if (c.action === 'screen_look') {
    return 'Screen dekho · ' + c.device + (a.window ? ' · window: ' + a.window : '') + (a.question ? '\n' + a.question : '');
  }
  const detail = a.url || a.app || a.text || '';
  return c.action + (detail ? ' → ' + detail : '') + ' (' + c.device + ')';
}

const AI_ACTION = /^(claude|gemini|codex)_(read|work)$/;
const ENGINE_LABEL = { claude: 'Claude', gemini: 'Gemini', codex: 'ChatGPT (Codex)' };
const isLong = (action) => AI_ACTION.test(action) || ['screen_look', 'claude_sessions', 'window_read', 'cpu_status', 'operate', 'call_run'].includes(action); // answers that arrive later, in chat

// Finished AI tasks are announced in the chat (or shown when the chat is next opened).
let finishedSeen = null;
let missedNotes = [];
function announceFinished(cmds) {
  const done = cmds.filter((c) => isLong(c.action) && (c.status === 'done' || c.status === 'failed'));
  if (finishedSeen === null) { finishedSeen = new Set(done.map((c) => c.id)); return; } // first load: stay quiet
  for (const c of done.reverse()) {
    if (finishedSeen.has(c.id)) continue;
    finishedSeen.add(c.id);
    const more = c.result_len > 1500 ? '\n… (poora jawab Devices > Recent PC actions me)' : '';
    const text = (c.status === 'done' ? 'Laptop ka kaam khatam (' + c.device + '):\n' : 'Laptop ka kaam fail hua (' + c.device + '):\n') + (c.result || '') + more;
    if (noteHook) note(text); else missedNotes.push(text);
  }
}

// While a laptop job is running (operate), its latest progress line appears in the chat.
const progressSeen = new Map();
let progressReady = false;
function announceProgress(cmds) {
  for (const c of cmds) {
    if (!['operate', 'call_run'].includes(c.action) || c.status !== 'running' || !c.result) continue;
    const last = c.result.trim().split('\n').pop();
    if (progressSeen.get(c.id) === last) continue;
    progressSeen.set(c.id, last);
    if (progressReady) { if (noteHook) note('\u23F3 ' + last); }
  }
  progressReady = true;
}

function renderPending(cmds, msgs) {
  pendingList = [
    ...cmds.filter((c) => c.status === 'awaiting_confirm').map((c) => ({
      route: 'command_decide', id: c.id, title: 'PC action: approval chahiye', text: describe(c),
      spoken: c.action.replace('_', ' ') + ' on ' + c.device, danger: ['shutdown', 'restart'].includes(c.action) || /_work$/.test(c.action),
    })),
    ...msgs.filter((m) => m.status === 'awaiting_confirm').map((m) => ({
      route: 'message_decide', id: m.id, title: 'WhatsApp → ' + m.contact + ': approval chahiye', text: m.body,
      spoken: m.contact + ' ko message: ' + m.body, danger: false,
    })),
  ];
  for (const p of pendingList) {
    const key = p.route + p.id;
    if (!announced.has(key)) {
      announced.add(key);
      speak('Approval chahiye. ' + p.spoken + '. Mic dabao aur haan ya nahi bolo.');
    }
  }
  const box = document.getElementById('pending');
  if (!box) return;
  box.replaceChildren(...pendingList.map((p) => h('div', { class: 'pend' },
    h('div', { class: 'muted' }, p.title),
    h('div', { class: 'mono' }, p.text),
    h('div', { class: 'row wrap' },
      h('button', { class: 'small', onclick: () => decide(p.route, p.id, true) }, 'Approve'),
      h('button', { class: 'small ghost', onclick: () => decide(p.route, p.id, false) }, 'Deny'),
      SR ? h('button', { class: 'small ghost', onclick: (e) => voiceAnswer(e.currentTarget) }, 'Bol kar jawab do') : null,
      p.danger ? h('span', { class: 'tag' }, 'risky: sirf tap se') : null))));
}

function voiceAnswer(btn) {
  if (activeRec) { activeRec.stop(); return; }
  btn.textContent = 'Sun raha hoon… (haan / nahi)';
  listen(async (t) => {
    if (!(await tryVoiceDecision(t))) note('Samajh nahi aaya: "' + t + '". Haan ya nahi bolo, ya button dabao.');
  }, () => { btn.textContent = 'Bol kar jawab do'; });
}

async function decide(route, id, approve) {
  try {
    const r = await api(route, { id, approve });
    if (approve && route === 'message_decide' && r.result) note('WhatsApp: ' + r.result);
  } catch (x) { note(x.message); }
  tick();
}

// Clipboard API first, a hidden textarea as the fallback; resolves true when the text was copied.
async function copyToClipboard(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (_) { /* fall through */ }
  try {
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0', 'aria-hidden': 'true' });
    ta.value = t;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) { return false; }
}

// ---------- command center (its own tab, below Leads) ----------
let hud = null; // { el, update(status) } while the Command Center tab is open
let chatIntent = null; // set by the Command Center buttons: the chat tab runs it when it opens

function meter(label, value, lowIsBad) {
  const known = typeof value === 'number';
  const hot = known && (lowIsBad ? value <= 20 : value >= 85);
  return h('div', { class: 'meter' },
    h('div', { class: 'meter-row' }, h('span', null, label), h('span', { class: 'mono' }, known ? Math.round(value) + '%' : '—')),
    h('div', { class: 'track' }, h('div', { class: 'fill' + (hot ? ' hot' : ''), style: 'width:' + (known ? Math.round(value) : 0) + '%' })));
}

function hudCard(title, badge, ...body) {
  return h('section', { class: 'hud-card' },
    h('header', null, h('span', null, title), badge ? h('span', { class: 'hud-badge' }, badge) : null),
    body);
}

function buildHud(actions) {
  const clock = h('span', { class: 'hud-clock mono' });
  const state = h('span', { class: 'hud-state' });
  const grid = h('div', { class: 'hud-grid' });
  const wave = h('div', { class: 'wave', 'aria-hidden': 'true' }, Array.from({ length: 11 }, (_, i) => h('i', { style: 'animation-delay:' + (i * 0.08) + 's' })));
  const open = prefs.hud !== false;
  const wrap = h('div', { class: 'hud' + (open ? '' : ' collapsed') });
  const toggle = h('button', { class: 'hud-toggle', type: 'button', 'aria-expanded': String(open), onclick: () => {
    const c = wrap.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!c));
    prefs.hud = !c;
    savePrefs();
  } }, h('span', null, 'COMMAND CENTER'), state, clock);
  wrap.append(toggle, grid);

  function update(s) {
    const now = new Date();
    clock.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const online = s.devices.filter((d) => d.online).length;
    // ready = at least one brain in the chain can answer right now (Gemini/OpenAI/Claude key, or the laptop agent)
    const ok = s.ai.ready;
    state.textContent = ok ? '● ONLINE' : '● KOI DIMAAG READY NAHI';
    state.className = 'hud-state ' + (ok ? 'good' : 'bad');

    const sys = hudCard('SYSTEM OVERVIEW', s.agents.filter((a) => a.online).length + ' PC ONLINE',
      s.agents.length
        ? s.agents.map((a) => h('div', { class: 'agent' + (a.online ? '' : ' off') },
          h('div', { class: 'agent-name' }, h('span', { class: 'dot' + (a.online ? ' on' : '') }), a.name),
          a.online ? [meter('CPU', a.cpu), meter('Memory', a.ram), a.battery != null ? meter('Battery', a.battery, true) : null] : h('div', { class: 'muted' }, 'offline')))
        : h('p', { class: 'muted' }, 'Koi PC agent nahi. Devices tab me jodo.'));

    const dev = hudCard('CONNECTED DEVICES', online + ' ONLINE',
      h('ul', { class: 'hud-list' }, s.devices.slice(0, 7).map((d) => h('li', null,
        h('span', { class: 'dot' + (d.online ? ' on' : '') }),
        h('span', { class: 'grow' }, d.name),
        h('span', { class: 'tag' }, d.role === 'agent' ? 'PC' : TYPE_LABEL[d.type] || d.type)))));

    const tasks = hudCard('ACTIVE TASKS', s.tasks_open + ' OPEN',
      s.tasks.length
        ? h('ul', { class: 'hud-list' }, s.tasks.map((t) => h('li', null,
          h('input', { type: 'checkbox', class: 'check', 'aria-label': 'Done: ' + t.title, onchange: async () => { await api('task_toggle', { id: t.id, done: true }); refreshHud(); } }),
          h('span', { class: 'grow' }, t.title),
          t.assignee === 'jarvis' ? h('span', { class: 'tag' }, 'Jarvis') : null)))
        : h('p', { class: 'muted' }, 'Koi open task nahi.'));

    const core = hudCard('AI CORE', s.pending ? s.pending + ' PENDING' : 'STANDBY',
      h('dl', { class: 'hud-kv' },
        h('dt', null, 'Brain'), h('dd', null, s.ai.chain.join(' → ')),
        h('dt', null, 'Laptop'), h('dd', { class: s.ai.laptop_online ? 'good' : 'bad' }, s.ai.laptop_online ? 'Online' : 'Offline'),
        h('dt', null, 'Seekha'), h('dd', null, s.ai.learning.skills + ' skills \u00b7 ' + s.ai.learning.local_pct + '% khud'),
        h('dt', null, 'Voice'), h('dd', { class: SR ? 'good' : 'bad' }, SR ? 'Ready' : 'Browser me nahi'),
        h('dt', null, 'WhatsApp'), h('dd', null, s.ai.contacts + ' contacts' + (s.ai.whatsapp ? ' · API' : ' · tap mode'))),
      h('button', { class: 'talk', type: 'button', onclick: actions.talk, disabled: !SR }, wave, h('span', null, 'TALK TO JARVIS')),
      h('div', { class: 'row wrap hud-actions' },
        h('button', { class: 'ghost small', type: 'button', onclick: actions.pcStatus }, 'PC status'),
        h('button', { class: 'ghost small', type: 'button', onclick: actions.screen }, 'Claude kya kar raha hai'),
        h('button', { class: 'ghost small', type: 'button', onclick: actions.newTask }, 'Naya task'),
        h('button', { class: 'ghost small danger', type: 'button', disabled: !s.pending, onclick: actions.stopAll }, 'Sab pending roko')));

    grid.replaceChildren(sys, dev, tasks, core);
  }
  return { el: wrap, update, wave };
}

async function refreshHud() {
  if (!hud) return;
  try { hud.update(await api('status')); } catch (x) { if (x.status === 401) boot(); }
}

// ---------- command center tab ----------
function viewCenter(view) {
  const toChat = (intent) => { chatIntent = intent; tab = 'chat'; renderView(); };
  hud = buildHud({
    talk: () => toChat({ talk: true }),
    pcStatus: () => toChat({ send: 'Mere PC ka status batao' }),
    screen: () => toChat({ send: 'Laptop par Claude ke sessions batao: kaun sa kaam chal raha hai aur kahan tak pahuncha' }),
    newTask: () => toChat({ prefill: 'Task add karo: ' }),
    stopAll: async () => { for (const p of [...pendingList]) await decide(p.route, p.id, false); refreshHud(); },
  });
  page(view, hud.el);
  refreshHud();
}

// ---------- chat ----------
function viewChat(view) {
  const scroll = h('div', { class: 'scroll', 'aria-live': 'polite' });
  const input = h('textarea', { rows: 1, maxlength: 2000, placeholder: 'Jarvis se kuch bhi kaho…', 'aria-label': 'Message', autocomplete: 'off' });
  const sendBtn = h('button', { class: 'icon-btn send', type: 'submit', 'aria-label': 'Bhejo', disabled: true }, icon('send'));
  const mic = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Bol kar likho', title: SR ? 'Mic' : 'Is browser me mic nahi', disabled: !SR }, icon('mic'));
  const spk = h('button', { class: 'icon-btn' + (prefs.speak ? ' on' : ''), type: 'button', 'aria-label': 'Jawab bol kar sunao', title: 'Jawab bol kar sunao' }, icon('speaker'));
  let empty = null;
  let attached = null; // {name, mime, data(base64)}: a photo or PDF to read with the next message
  const fileInput = h('input', { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' });
  const clipBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Photo ya PDF jodo', title: 'Photo / PDF padhwao (dawai ki parchi, report, sawal)' }, icon('clip'));
  const fileChip = h('div', { class: 'hint', style: 'display:none' });

  let lastQ = ''; // the question the next answer belongs to, so one tap copies both
  const add = (cls, text) => {
    if (empty) { empty.remove(); empty = null; }
    let m;
    if (cls === 'assistant' && text) {
      const q = lastQ;
      const btn = h('button', { class: 'copy-btn', type: 'button', title: 'Sawal aur jawab dono copy karo', 'aria-label': 'Sawal aur jawab copy karo' }, 'Copy');
      btn.addEventListener('click', async () => {
        const ok = await copyToClipboard((q ? 'Sawal:\n' + q + '\n\n' : '') + 'Jawab:\n' + text);
        btn.textContent = ok ? 'Copy ho gaya' : 'Copy nahi hua';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
      });
      m = h('div', { class: 'msg assistant' }, h('div', { class: 'msg-text' }, text), h('div', { class: 'msg-tools' }, btn));
    } else {
      m = h('div', { class: 'msg ' + cls }, text);
      if (cls === 'user') lastQ = text || '';
    }
    scroll.append(m);
    scroll.scrollTop = scroll.scrollHeight;
    return m;
  };
  noteHook = (t) => add('note', t);
  while (missedNotes.length) add('note', missedNotes.shift()); // results that arrived while you were on another tab

  async function send(text, viaVoice) {
    text = text.trim();
    const file = attached;
    if (!text && !file) return;
    if (!text) text = 'Is ko padh kar aasan bhasha me samjhao';
    input.value = '';
    attached = null;
    fileChip.style.display = 'none';
    fit();
    add('user', (file ? '\u{1F4CE} ' + file.name + '\n' : '') + text);
    const wait = add('assistant typing', null);
    wait.append(h('span'), h('span'), h('span'));
    try {
      let res = await api('chat', file ? { text, file: { mime: file.mime, data: file.data } } : { text });
      if (res.job) { // the laptop is thinking (your own subscription, no API); poll until it answers
        const t0 = Date.now();
        wait.querySelector('span:last-child').textContent = '';
        for (;;) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await api('chat_poll&id=' + res.job);
          if (res.done) break;
          if (Date.now() - t0 > 250000) throw new Error('Laptop se jawab nahi aaya');
        }
        if (res.error) throw new Error(res.error);
      }
      const { reply, actions } = res;
      wait.remove();
      add('assistant', reply);
      for (const a of actions || []) {
        // Only these schemes; the user's own tap on the link is the approval.
        if (!/^(tel:|whatsapp:|https:\/\/(wa\.me|www\.youtube\.com|www\.google\.com)\/)/.test(a.url)) continue;
        scroll.append(h('a', { class: 'btn', href: a.url, rel: 'noopener noreferrer' }, a.label));
      }
      scroll.scrollTop = scroll.scrollHeight;
      speak(reply, !!viaVoice); // spoken question -> spoken answer; typed question -> text only
      kickScheduler();
      tick();
    } catch (x) {
      wait.remove();
      add('err', x.message);
    }
  }

  function fit() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    sendBtn.disabled = input.value.trim() === '' && !attached;
  }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth >= 900) {
      e.preventDefault();
      send(input.value);
    }
  });

  function talk() {
    if (window.JarvisNative && JarvisNative.stopSpeaking) JarvisNative.stopSpeaking();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (activeRec) { activeRec.stop(); return; }
    mic.classList.add('live');
    listen(async (t) => {
      if (!(await tryVoiceDecision(t))) send(t, true); // "haan"/"nahi" answers a waiting approval, anything else is chat
    }, () => { mic.classList.remove('live'); });
  }
  mic.addEventListener('click', talk);
  spk.addEventListener('click', () => {
    prefs.speak = !prefs.speak;
    savePrefs();
    spk.classList.toggle('on', prefs.speak);
    const box = document.getElementById('spk');
    if (box) box.checked = prefs.speak;
    if (!prefs.speak && 'speechSynthesis' in window) speechSynthesis.cancel();
  });

  // A photo is shrunk in the browser (max 1600 px, JPEG) so it uploads fast; a PDF goes as it is (max 4 MB).
  function readFile(f) {
    return new Promise((resolve, reject) => {
      const done = (mime, dataUrl) => resolve({ name: f.name, mime, data: dataUrl.split(',')[1] });
      if (f.type === 'application/pdf') {
        if (f.size > 4 * 1024 * 1024) return reject(new Error('PDF 4 MB se chhota chahiye'));
        const r = new FileReader();
        r.onload = () => done('application/pdf', r.result);
        r.onerror = () => reject(new Error('File padh nahi paya'));
        return r.readAsDataURL(f);
      }
      if (!f.type.startsWith('image/')) return reject(new Error('Sirf photo ya PDF'));
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        done('image/jpeg', c.toDataURL('image/jpeg', 0.85));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('Photo khul nahi payi'));
      img.src = URL.createObjectURL(f);
    });
  }
  clipBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      attached = await readFile(f);
      fileChip.textContent = '\u{1F4CE} ' + attached.name + ' - ab kuch likho (ya seedha bhejo)';
      fileChip.style.display = '';
      fit();
    } catch (x) {
      add('err', x.message);
    }
  });

  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
    fileChip,
    input,
    h('div', { class: 'row' }, h('div', { class: 'row' }, spk, clipBtn, fileInput), h('div', { class: 'row' }, mic, sendBtn)));

  view.append(
    scroll,
    h('div', { class: 'dock' }, h('div', { class: 'col' },
      h('div', { id: 'pending' }), form,
      h('p', { class: 'hint' }, 'Risky kaam tabhi hote hain jab aap Approve karo. Mic aapke browser ki voice service se chalta hai.'))));

  const intent = chatIntent;
  chatIntent = null;
  api('chat_history').then(({ messages }) => {
    if (intent) setTimeout(() => { // after the history is drawn, so the answer lands under it
      if (intent.talk) talk();
      else if (intent.send) send(intent.send);
      else if (intent.prefill) { input.value = intent.prefill; input.focus(); fit(); }
    }, 50);
    if (!messages.length) {
      empty = h('div', { class: 'empty col' },
        h('h1', { class: 'serif' }, 'Namaste, ' + state.user),
        h('div', { class: 'chips' }, CHIPS.map((c) => h('button', { class: 'chip', type: 'button', onclick: () => send(c) }, c))));
      scroll.append(empty);
    } else {
      messages.forEach((m) => add(m.role, m.content));
    }
  }).catch((x) => add('err', x.message));
}

// ---------- tasks & notes ----------
function simpleList(view, cfg) {
  const list = h('div', { class: 'card' });
  const err = h('div', { class: 'error', role: 'alert' });
  const input = h(cfg.multiline ? 'textarea' : 'input', { placeholder: cfg.placeholder, maxlength: cfg.max, 'aria-label': cfg.placeholder, rows: cfg.multiline ? 3 : undefined });

  async function load() {
    const rows = (await api(cfg.route))[cfg.route];
    list.replaceChildren(...(rows.length ? rows.map(cfg.render(load)) : [h('p', { class: 'muted' }, 'Abhi kuch nahi.')]));
  }
  page(view,
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const r = await api(cfg.addRoute, { [cfg.field]: input.value });
        if (/^Error/.test(r.result)) throw new Error(r.result);
        input.value = '';
        load();
      } catch (x) { err.textContent = x.message; }
    } }, input, err, h('button', { type: 'submit' }, 'Add')),
    h('div', { style: 'height:14px' }), list);
  load().catch((x) => { err.textContent = x.message; });
}

let refreshTasks = null; // set while the Tasks tab is open so the 4 second poll can refresh it
const CAT_EMOJI_FREE = ''; // categories are plain words on purpose: no icons to maintain

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function viewTasks(view) {
  const filters = { cat: '', status: '' };
  let meta = { categories: {}, statuses: {} };
  const open = new Set();
  const list = h('div');
  const err = h('div', { class: 'error', role: 'alert' });

  const title = h('input', { placeholder: 'Kaam ka naam', maxlength: 200, 'aria-label': 'Kaam ka naam', required: true });
  const cat = h('select', { 'aria-label': 'Category' });
  const who = h('select', { 'aria-label': 'Kaun karega' },
    h('option', { value: 'me' }, 'Main khud karunga'), h('option', { value: 'jarvis' }, 'Jarvis kare'));
  const details = h('textarea', { placeholder: 'Details (optional): Jarvis ko kya chahiye, kaun si site/topic, kitna', rows: 2, maxlength: 4000, 'aria-label': 'Details' });
  const due = h('input', { type: 'date', 'aria-label': 'Due date' });
  const fCat = h('select', { 'aria-label': 'Category filter', onchange: (e) => { filters.cat = e.target.value; load(); } });
  const fStatus = h('select', { 'aria-label': 'Status filter', onchange: (e) => { filters.status = e.target.value; load(); } });

  function badge(text, cls) { return h('span', { class: 'tag' + (cls ? ' ' + cls : '') }, text); }

  async function detailBox(task) {
    const box = h('div', { class: 'task-detail' }, h('p', { class: 'muted' }, 'Load ho raha hai...'));
    try {
      const d = await api('task_detail&id=' + task.id);
      const note = h('input', { placeholder: 'Is kaam par note likho', maxlength: 2000, 'aria-label': 'Note' });
      box.replaceChildren(
        d.task.details ? h('div', { class: 'result-full' }, d.task.details) : null,
        h('div', null, d.log.map((l) => h('div', { class: 'log-row' },
          h('span', { class: 'muted' }, fmtTime(l.created_at) + ' · ' + (l.author === 'jarvis' ? 'Jarvis' : 'Aap')),
          h('div', { class: 'result-full' }, l.text)))),
        h('form', { class: 'row', onsubmit: async (e) => {
          e.preventDefault();
          if (!note.value.trim()) return;
          await api('task_note', { id: task.id, text: note.value });
          load();
        } }, note, h('button', { type: 'submit', class: 'small' }, 'Note')),
        h('div', { class: 'row wrap', style: 'margin-top:8px' },
          h('button', { class: 'small', type: 'button', onclick: async () => { await api('task_run', { id: task.id }); open.delete(task.id); load(); } }, 'Jarvis se abhi karwao'),
          h('button', { class: 'ghost small danger', type: 'button', onclick: async () => {
            if (confirm('Ye kaam delete karein?')) { await api('task_delete', { id: task.id }); load(); }
          } }, 'Delete')));
    } catch (x) { box.textContent = x.message; }
    return box;
  }

  async function load() {
    const data = await api('tasks');
    meta = data;
    if (!cat.options.length) {
      Object.entries(data.categories).forEach(([k, v]) => cat.append(h('option', { value: k, selected: k === 'other' }, v)));
      fCat.append(h('option', { value: '' }, 'Sab category'));
      Object.entries(data.categories).forEach(([k, v]) => fCat.append(h('option', { value: k }, v)));
      fStatus.append(h('option', { value: '' }, 'Sab status'));
      Object.entries(data.statuses).forEach(([k, v]) => fStatus.append(h('option', { value: k }, v)));
    }
    const rows = data.tasks.filter((x) => (!filters.cat || x.category === filters.cat) && (!filters.status || x.status === filters.status));
    const items = [];
    for (const x of rows) {
      const statusSel = h('select', { 'aria-label': 'Status', onchange: async (e) => { await api('task_status', { id: x.id, status: e.target.value }); load(); } },
        Object.entries(data.statuses).map(([k, v]) => h('option', { value: k, selected: k === x.status }, v)));
      const row = h('div', { class: 'item task-item' + (x.status === 'done' ? ' done' : '') },
        h('div', { class: 'grow' },
          h('div', { class: 'task-title', onclick: () => { open.has(x.id) ? open.delete(x.id) : open.add(x.id); load(); } }, x.title),
          h('div', { class: 'row wrap', style: 'gap:6px;margin-top:4px' },
            badge(data.categories[x.category] || x.category), badge(x.assignee === 'jarvis' ? 'Jarvis' : 'Aap', x.assignee === 'jarvis' ? 'accent' : ''),
            x.run_state ? badge('Jarvis kaam kar raha hai...', 'accent') : null,
            x.due ? badge('due ' + x.due) : null, x.notes > 1 ? badge(x.notes + ' notes') : null)),
        statusSel);
      items.push(row);
      if (open.has(x.id)) items.push(await detailBox(x));
    }
    list.replaceChildren(...(items.length ? items : [h('p', { class: 'muted' }, 'Koi kaam nahi.')]));
  }
  refreshTasks = () => { if (!document.querySelector('.task-detail input:focus, .task-detail textarea:focus')) load().catch(() => {}); };

  page(view,
    h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const r = await api('task_add', { title: title.value, category: cat.value, assignee: who.value, details: details.value, due: due.value });
        if (/^Error/.test(r.result)) throw new Error(r.result);
        title.value = ''; details.value = ''; due.value = '';
        if (who.value === 'jarvis') kickScheduler();
        load();
      } catch (x) { err.textContent = x.message; }
    } }, title, h('div', { class: 'row wrap' }, cat, who, due), details, err, h('button', { type: 'submit' }, 'Kaam jodo')),
    h('div', { class: 'row wrap', style: 'margin:12px 0' }, fCat, fStatus),
    h('div', { class: 'card' }, list));
  load().catch((x) => { err.textContent = x.message; });
}

// ---------- report + routines ----------
function viewReport(view) {
  const reports = h('div');
  const routines = h('div', { class: 'card' });
  const err = h('div', { class: 'error', role: 'alert' });
  const KIND = { report_morning: 'Subah ka plan', report_evening: 'Shaam ki report', news: 'Roz ki news', research: 'Roz ki research' };

  const rKind = h('select', { 'aria-label': 'Routine ka type' }, Object.entries(KIND).map(([k, v]) => h('option', { value: k, selected: k === 'news' }, v)));
  const rTitle = h('input', { placeholder: 'Naam, jaise "AI news"', maxlength: 120, 'aria-label': 'Routine ka naam', required: true });
  const rQuery = h('input', { placeholder: 'Topic / kya dekhna hai (news/research ke liye)', maxlength: 500, 'aria-label': 'Topic' });
  const rTime = h('input', { type: 'time', value: '07:30', required: true, 'aria-label': 'Samay' });

  async function load() {
    const [{ reports: rs }, { routines: ro }] = await Promise.all([api('reports'), api('routines')]);
    reports.replaceChildren(...(rs.length ? rs.map((r, i) => h('details', { class: 'card', open: i === 0 },
      h('summary', null, (r.kind === 'morning' ? 'Subah ka plan' : 'Shaam ki report') + ' · ' + fmtTime(r.created_at)),
      h('div', { class: 'result-full' }, r.body))) : [h('p', { class: 'muted' }, 'Abhi koi report nahi bani. Neeche button se banao, ya routine ka samay aane par apne aap banegi.')]));
    routines.replaceChildren(...ro.map((r) => h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', null, r.title, ' ', badge2(KIND[r.kind] || r.kind)),
        h('div', { class: 'muted' }, 'Roz ' + r.hhmm + (r.query ? ' · ' + r.query : '') + (r.last_run_date ? ' · aakhri baar ' + r.last_run_date : ''))),
      h('button', { class: 'ghost small', onclick: async () => {
        await api('routine_save', { id: r.id, kind: r.kind, title: r.title, query: r.query, hhmm: r.hhmm, enabled: !r.enabled }); load();
      } }, r.enabled ? 'Band karo' : 'Chalu karo'),
      h('button', { class: 'ghost small danger', onclick: async () => { await api('routine_delete', { id: r.id }); load(); } }, 'Delete'))));
  }
  const badge2 = (text) => h('span', { class: 'tag' }, text);
  const make = (kind, label) => h('button', { class: 'small', type: 'button', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try { await api('report_now', { kind }); await load(); } catch (x) { err.textContent = x.message; }
    e.currentTarget.disabled = false;
  } }, label);

  page(view,
    h('p', { class: 'muted' }, 'Jarvis subah plan aur shaam ko report banata hai: aaj kya hua, kya baaki hai, kya aapko dekhna hai. Roz ke routines Jarvis ko apne aap kaam dete hain. Ye tab chalte hain jab laptop agent chal raha ho ya ye app khula ho.'),
    h('div', { class: 'row wrap' }, make('morning', 'Subah ka plan abhi banao'), make('evening', 'Shaam ki report abhi banao')),
    h('h2', null, 'Reports'), reports,
    h('h2', null, 'Roz ke routines'), routines,
    h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        await api('routine_save', { kind: rKind.value, title: rTitle.value, query: rQuery.value, hhmm: rTime.value, enabled: true });
        rTitle.value = ''; rQuery.value = '';
        load();
      } catch (x) { err.textContent = x.message; }
    } }, h('div', { class: 'muted' }, 'Naya routine'), h('div', { class: 'row wrap' }, rKind, rTime), rTitle, rQuery, err, h('button', { type: 'submit' }, 'Routine jodo')));
  load().catch((x) => { err.textContent = x.message; });
}

function viewNotes(view) {
  simpleList(view, {
    route: 'notes', addRoute: 'note_add', field: 'body', placeholder: 'Naya note', max: 2000, multiline: true,
    render: (reload) => (n) => h('div', { class: 'item' },
      h('div', { class: 'grow', style: 'white-space:pre-wrap' }, n.body),
      h('button', { class: 'ghost small', onclick: async () => { await api('note_delete', { id: n.id }); reload(); } }, 'Delete')),
  });
}

// ---------- per-device IDs (username + password for each phone/TV/laptop) ----------
function deviceIdsCard() {
  const list = h('div');
  let editing = null; // null = nothing open, 0 = new, number = that ID

  function form(l) {
    const err = h('div', { class: 'error', role: 'alert' });
    const f = {
      name: h('input', { value: l ? l.name : '', maxlength: 40, required: true, placeholder: 'Device ka naam, jaise iPhone Office' }),
      type: typeSelect(l ? l.type : 'iphone'),
      login: h('input', { value: l ? l.login_name : '', maxlength: 32, required: true, autocomplete: 'off', placeholder: 'Username, jaise iphone2', autocapitalize: 'none' }),
      pw: h('input', { type: 'password', autocomplete: 'new-password', placeholder: l ? 'Naya password (khali = purana hi rahega)' : 'Password (10+ akshar, letter + number)', required: !l }),
    };
    const show = h('input', { type: 'checkbox', class: 'check', id: 'sp' + (l ? l.id : 'new'), onchange: (e) => { f.pw.type = e.target.checked ? 'text' : 'password'; } });
    return h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        await api('device_login_save', { id: l ? l.id : 0, name: f.name.value, type: f.type.value, login_name: f.login.value, password: f.pw.value });
        editing = null;
        load();
      } catch (x) { err.textContent = x.message; }
    } },
      h('label', null, 'Device ka naam'), f.name,
      h('label', null, 'Device type'), f.type,
      h('label', null, 'Username'), f.login,
      h('label', null, 'Password'), f.pw,
      h('div', { class: 'row', style: 'margin-bottom:10px' }, show, h('label', { for: 'sp' + (l ? l.id : 'new') }, 'Password dikhao')),
      err,
      h('div', { class: 'row wrap' },
        h('button', { type: 'submit' }, 'Save'),
        h('button', { type: 'button', class: 'ghost', onclick: () => { editing = null; load(); } }, 'Cancel')));
  }

  async function load() {
    const { logins } = await api('device_logins');
    list.replaceChildren(...[
      ...logins.map((l) => editing === l.id ? form(l) : h('div', { class: 'item' },
        h('div', { class: 'grow' },
          h('div', null, l.name, ' ', h('span', { class: 'tag' }, TYPE_LABEL[l.type] || l.type)),
          h('div', { class: 'muted' }, 'Username: ', h('span', { class: 'mono' }, l.login_name), l.last_seen ? ' · last seen ' + timeAgo(l.last_seen) : ' · abhi tak login nahi hua')),
        h('button', { class: 'ghost small', onclick: () => { editing = l.id; load(); } }, 'Edit'),
        h('button', { class: 'ghost small danger', onclick: async () => {
          if (confirm(l.name + ' ka ID/password delete karein? Wo device logout ho jayega.')) { await api('device_login_delete', { id: l.id }); load(); }
        } }, 'Delete'))),
      logins.length || editing === 0 ? null : h('p', { class: 'muted' }, 'Abhi koi device ID nahi hai.'),
      editing === 0 ? form(null) : h('button', { class: 'small', style: 'margin-top:10px', onclick: () => { editing = 0; load(); } }, '+ Naya device ID'),
    ].filter(Boolean)); // replaceChildren would print a literal "null"
  }
  load();
  return h('div', { class: 'card' },
    h('p', { class: 'muted' }, 'Har phone/TV/laptop ka apna username aur password. Sab ek hi data dekhte hain. Password hash ho kar save hota hai, wapas dikhaya nahi ja sakta; badalna ho to Edit me naya daalo.'),
    list);
}

// ---------- devices ----------
let devicesBox = null;
let recentBox = null;

function viewDevices(view) {
  devicesBox = h('div', { class: 'card' });
  recentBox = h('div', { class: 'card' });
  const pauseBox = h('div', { class: 'card' });
  const drawPause = async () => {
    const { paused } = await api('status');
    pauseBox.replaceChildren(
      h('p', { class: paused ? 'error' : 'muted' }, paused ? 'Jarvis PAUSE hai: koi agent kaam nahi kar raha.' : 'Jarvis chalu hai. Emergency me ek tap se sab agents rok sakte ho.'),
      h('button', { class: paused ? '' : 'danger', onclick: async () => { await api('pause', { paused: !paused }); drawPause(); } }, paused ? 'Resume (dobara chalu karo)' : 'PAUSE: sab agents roko'));
  };
  drawPause();
  page(view,
    h('h2', null, 'Emergency switch'), pauseBox,
    h('h2', null, 'Mere devices'), devicesBox,
    h('h2', null, 'Device ID aur Password'), deviceIdsCard(),
    h('h2', null, 'Apps (download karke install karo)'), appsCard(),
    h('h2', null, 'Recent PC actions'), recentBox);
  loadDevices();
}

async function loadDevices() {
  if (!devicesBox) return;
  const { devices } = await api('devices');
  if (!devicesBox) return;
  devicesBox.replaceChildren(...devices.map((d) => h('div', { class: 'item' },
    h('span', { class: 'dot' + (d.online ? ' on' : ''), title: d.online ? 'online' : 'offline' }),
    h('div', { class: 'grow' },
      h('div', null, d.name, ' ', d.current ? h('span', { class: 'tag' }, 'yeh device') : null, ' ',
        h('span', { class: 'tag' }, d.role === 'agent' ? 'PC agent' : TYPE_LABEL[d.type] || d.type),
        d.blocked ? h('span', { class: 'tag' }, 'blocked') : null),
      h('div', { class: 'muted' }, 'Last seen: ' + timeAgo(d.last_seen))),
    d.current ? null : h('button', { class: 'ghost small', onclick: async () => { await api('device_block', { id: d.id, blocked: !d.blocked }); loadDevices(); } }, d.blocked ? 'Unblock' : 'Block'),
    d.current ? null : h('button', { class: 'ghost small', onclick: async () => {
      if (confirm(d.name + ' ko delete karein?')) { await api('device_delete', { id: d.id }); loadDevices(); }
    } }, 'Delete'))));
}

function renderRecent(cmds) {
  if (!recentBox) return;
  if (recentBox.querySelector('details[open]')) return; // don't collapse an answer you are reading
  recentBox.replaceChildren(...(cmds.length ? cmds.slice(0, 8).map((c) => {
    const body = h('div', { class: 'result-full muted' }, c.result || '');
    const full = c.result_len > 1500;
    return h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('div', { class: 'mono' }, describe(c)),
        c.result ? (isLong(c.action)
          ? h('details', { ontoggle: async (e) => {
            if (e.target.open && full) {
              try { body.textContent = (await api('command_result&id=' + c.id)).result; } catch (x) { body.textContent = x.message; }
            }
          } }, h('summary', null, 'Jawab dekho'), body)
          : h('div', { class: 'muted' }, c.result)) : null),
      h('span', { class: 'tag' }, c.status));
  }) : [h('p', { class: 'muted' }, 'Abhi koi action nahi.')]));
}

// ---------- what Jarvis has learned ----------
function viewSkills(view) {
  const stats = h('div', { class: 'card' });
  const list = h('div', { class: 'card' });
  const err = h('div', { class: 'error', role: 'alert' });

  async function load() {
    const { skills, stats: s, min_seen: minSeen } = await api('skills');
    stats.replaceChildren(
      h('div', { class: 'kv-big' },
        h('div', null, h('b', null, String(s.skills)), h('span', { class: 'muted' }, ' skills seekh chuka')),
        h('div', null, h('b', null, s.local_pct + '%'), h('span', { class: 'muted' }, ' messages khud (bina AI) hue, pichle 30 din')),
        h('div', null, h('b', null, String(s.learning)), h('span', { class: 'muted' }, ' seekh raha hai (' + minSeen + ' baar sahi dikhne par pakka hota hai)'))),
      h('p', { class: 'muted' }, 'AI (teacher) ne kitne jawab diye: ' +
        (Object.entries(s.by_provider).map(([k, v]) => k + ' ' + v).join(' \u00b7 ') || 'abhi koi nahi')),
      h('a', { class: 'btn', href: 'api.php?r=brain_export', download: 'jarvis-training-data.jsonl' }, 'Training data download (.jsonl)'));
    list.replaceChildren(...(skills.length ? skills.map((k) => h('div', { class: 'item' },
      h('div', { class: 'grow' },
        h('div', { class: 'mono' }, k.template),
        h('div', { class: 'muted' }, k.does + ' \u00b7 dekha ' + k.seen_count + ' baar \u00b7 khud chalaya ' + k.used_count + ' baar'),
        h('span', { class: 'tag' }, !k.enabled ? 'band' : k.active ? 'pakka (khud chalta hai)' : 'seekh raha hai')),
      h('button', { class: 'ghost small', onclick: async () => { await api('skill_toggle', { id: k.id, enabled: !k.enabled }); load(); } }, k.enabled ? 'Band karo' : 'Chalu karo'),
      h('button', { class: 'ghost small danger', onclick: async () => { await api('skill_delete', { id: k.id }); load(); } }, 'Bhool jao'))) : [
      h('p', { class: 'muted' }, 'Abhi kuch nahi seekha. Jarvis se kaam karwao (jaise "mom ko call karo", "task jodo: ..."). Jo baat Gemini do baar ek jaisi samjhata hai, wo yahan aa jaati hai.')]));
  }
  page(view,
    h('p', { class: 'muted' }, 'Jarvis har kaam Gemini (teacher) se samajhta hai aur yaad rakhta hai. Jo baat wo pakki seekh leta hai, usme agli baar AI ki zarurat nahi padti, aur wo turant hota hai. Naye ya lambe sawal ab bhi AI se jaate hain. Approval ke niyam skills par bhi pehle jaise hi lagte hain.'),
    stats, h('h2', null, 'Seekhi hui baatein'), list, err);
  load().catch((x) => { err.textContent = x.message; });
}

// ---------- downloadable apps ----------
function appsCard() {
  const files = h('div');
  const codeOut = h('div');
  const err = h('div', { class: 'error', role: 'alert' });
  api('downloads').then(({ files: fs }) => {
    files.replaceChildren(...(fs.length ? fs.map((f) => h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('div', null, f.label), h('div', { class: 'muted' }, (f.size / 1048576).toFixed(1) + ' MB · ' + fmtTime(f.date))),
      h('a', { class: 'btn', href: 'api.php?r=download&file=' + encodeURIComponent(f.file), download: f.file }, 'Download'))) :
      [h('p', { class: 'muted' }, 'Abhi koi app upload nahi hui.')]));
  }).catch((x) => { files.textContent = x.message; });

  return h('div', { class: 'card' },
    files,
    h('h2', null, 'Laptop ya phone ko kaise jodein'),
    h('p', { class: 'muted' }, '1. Upar "Device ID aur Password" me + Naya device ID dabao: naam likho, device type chuno (Laptop / Android...), username aur password rakho.'),
    h('p', { class: 'muted' }, '2. App download karke install karo, kholo aur wahi username/password daalo. Bas, ho gaya: koi code nahi.'),
    h('p', { class: 'muted' }, '3. Password badalna ho to Device ID me Edit dabake naya daalo. App apne aap naye password se login ho jati hai (agar app me bhi badla ho).'));
}

// ---------- content: briefs, history, results, own-text check, rules editor ----------
let contentTimer = null;

function copyText(t) {
  copyToClipboard(t);
}

function reportBox(r) {
  return h('div', null,
    h('p', { class: r.pass ? 'tag accent' : 'error', role: 'status' },
      r.pass ? 'Sab zaroori checks PASS (' + r.words + ' words)' : r.failed.length + ' zaroori check fail hain (' + r.words + ' words)'),
    r.checks.map((c) => h('div', { class: 'item' },
      h('span', { class: 'tag' + (c.ok ? ' accent' : '') }, c.ok ? 'OK' : (c.hard ? 'FAIL' : 'tip')),
      h('div', { class: 'grow' }, c.label,
        h('div', { class: 'muted' }, c.value + (c.ok ? '' : ' (chahiye: ' + c.need + ')'))))),
    h('p', { class: 'muted' }, 'Ye aapko khud dekhna hai (program nahi kar sakta):'),
    r.manual.map((m, i) => h('div', { class: 'row' },
      h('input', { type: 'checkbox', class: 'check', id: 'man' + i }), h('label', { for: 'man' + i }, m))));
}

function fieldWithCopy(label, value, extra) {
  return h('div', { style: 'margin-bottom:10px' },
    h('label', null, label, extra ? h('span', { class: 'muted' }, ' ' + extra) : null),
    h('div', { class: 'row' }, h('input', { value, readonly: true, class: 'grow' }),
      h('button', { type: 'button', class: 'ghost small', onclick: () => copyText(value) }, 'Copy')));
}

/** replaceChildren that accepts arrays, skips null/false (conditional pieces) and never prints the word "null". */
function put(box, ...kids) {
  box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

// ---------- Content Quality gates (CQO): three real checks, versions, evidence, correction cycles, owner approval ----------
const GATE_LABELS = { grammar: 'Grammar (85% ya zyada)', ai_detection: 'AI detection (8% ya kam)', plagiarism: 'Plagiarism (bilkul 0%)', factual: 'Tathya / sources check', evidence: 'Provider ka saboot' };

function gateChip(status) {
  return h('span', { class: 'tag ' + (status === 'PASS' || status === 'APPROVED' ? 'accent' : status === 'FAIL' || status === 'REJECTED' ? 'bad' : 'warn') }, status);
}

function providerSettings() {
  const box = h('div', { class: 'card' });
  const msg = h('div', { class: 'muted', role: 'status' });
  const keyInput = h('input', { type: 'password', autocomplete: 'off', maxlength: 32, placeholder: 'Sapling API key (32 akshar)', 'aria-label': 'Sapling API key' });
  async function load() {
    const j = await api('content_provider');
    const p = j.providers;
    put(box,
      h('p', { class: 'muted' }, 'AI detection aur plagiarism ke asli providers. Har state asli jawab ke baad hi "CONNECTED & VERIFIED" hoti hai.'),
      Object.entries(p).map(([k, v]) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, v.name), h('div', { class: 'muted' }, v.state), h('div', { class: 'muted' }, 'Bhashayen: ' + v.languages), v.note ? h('div', { class: 'muted' }, v.note) : null))),
      h('h2', null, 'Sapling AI Detector key'),
      h('p', { class: 'muted' }, 'sapling.ai par apna account bana kar free key lo (roz 50,000 akshar free). Key sirf server par (web root ke bahar) rehti hai, wapas kabhi nahi dikhti. Article ka text sirf tab jata hai jab "Bahari provider allow karo" on ho, aur zero_retention ke saath.'),
      h('div', { class: 'row wrap' }, keyInput,
        h('button', { onclick: async () => { msg.textContent = ''; try { await api('content_provider_key', { provider: 'sapling', key: keyInput.value }); keyInput.value = ''; msg.textContent = 'Key save ho gayi. Ab "Test connection" dabao.'; load(); } catch (x) { msg.textContent = x.message; } } }, 'Key save karo'),
        h('button', { class: 'ghost', onclick: async () => { msg.textContent = 'Asli request ja rahi hai...'; try { const r = await api('content_provider_test', { provider: 'sapling' }); msg.textContent = r.message; load(); } catch (x) { msg.textContent = x.message; } } }, 'Test connection'),
        j.sapling.configured && !j.sapling.from_config ? h('button', { class: 'ghost danger', onclick: async () => { if (confirm('Key hata dein?')) { await api('content_provider_key', { provider: 'sapling', key: '' }); load(); } } }, 'Key hatao') : null),
      j.sapling.configured ? h('p', { class: 'muted' }, 'Key set hai (' + j.sapling.key_hint + ')' + (j.sapling.from_config ? ' · server config se' : '')) : null,
      msg,
      h('h2', null, 'Plagiarism ke liye aage kya'),
      h('p', { class: 'muted' }, 'Ab tak koi plagiarism API aisa nahi mila jiska documentation poora verify ho aur jo is server par seedha chale. Copyleaks ka plagiarism scan sirf webhook se natija deta hai (public HTTPS address chahiye) aur uske credits paid hain. Tab tak aap apne checker ka asli natija "Plagiarism ka asli result daalo" me daalte ho.'));
  }
  load().catch((x) => put(box, h('p', { class: 'error' }, x.message)));
  return box;
}

function qualityDashboard() {
  const box = h('div', { class: 'card' });
  api('content_quality').then((d) => {
    const num = (v, s) => (v == null ? 'abhi nahi' : v + (s || ''));
    put(box, h('p', { class: 'muted' }, 'Content Quality Center: ye sab aankde asli records se aate hain.'),
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, 'Kul: ' + d.total), h('span', { class: 'tag accent' }, 'Approved: ' + d.approved), h('span', { class: 'tag bad' }, 'Rejected: ' + d.rejected),
        h('span', { class: 'tag warn' }, 'Pending / not verified: ' + d.pending), h('span', { class: 'tag' }, 'Manual review: ' + d.manual_review), h('span', { class: 'tag' }, 'Fail checks: ' + d.failed_checks)),
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, 'Avg grammar: ' + num(d.avg_grammar, '%')), h('span', { class: 'tag' }, 'Avg AI: ' + num(d.avg_ai, '%')), h('span', { class: 'tag' }, 'Avg plagiarism: ' + num(d.avg_plagiarism, '%'))),
      Object.values(d.providers).map((p) => h('div', { class: 'muted' }, p.name + ': ' + p.state)));
  }).catch(() => {});
  return box;
}

function renderGate(taskId) {
  const box = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Quality gate load ho raha hai...'));
  const msg = h('div', { class: 'error', role: 'alert' });

  async function load(version) {
    const j = await api('content_gate_get&id=' + taskId + (version ? '&v=' + version : ''));
    if (!j.gates) { put(box, h('p', { class: 'muted' }, 'Pehle draft taiyar hone do.')); return; }
    const g = j.gates, doc = j.version.doc, viewing = j.version.version;
    const run = async (fn) => { msg.textContent = ''; try { await fn(); await load(); } catch (x) { msg.textContent = x.message; await load().catch(() => {}); } };
    const info = (name) => { const x = g.gates[name]; return x.provider ? x.provider + (x.kind === 'manual' ? ' (aapne daala)' : ' (provider)') + (x.score != null ? ' · ' + x.score : '') + (x.note ? ' · ' + x.note : '') : x.note; };
    const row = (name, ...controls) => h('div', null, h('div', { class: 'item' }, gateChip(g.gates[name].status),
      h('div', { class: 'grow' }, GATE_LABELS[name], h('div', { class: 'muted' }, info(name))), ...controls),
      g.gates[name].results.length > 1 || (g.gates[name].results[0] && g.gates[name].results[0].status === 'NOT VERIFIED')
        ? g.gates[name].results.map((r) => h('div', { class: 'muted', style: 'margin-left:18px' }, '• ' + r.provider + (r.kind === 'manual' ? ' (aapne daala)' : ' (provider)') + ' · ' + (r.score != null ? r.score : '-') + ' · ' + r.status + (r.note ? ' · ' + r.note : ''))) : null);

    const f = {
      aiProv: h('input', { placeholder: 'Detector ka naam (ZeroGPT...)', maxlength: 60 }), aiScore: h('input', { type: 'number', min: 0, max: 100, step: '0.1', placeholder: 'AI %' }),
      aiLang: h('input', { type: 'checkbox', class: 'check', id: 'ailang' + taskId, checked: true }),
      plProv: h('input', { placeholder: 'Plagiarism checker ka naam', maxlength: 60 }), plScore: h('input', { type: 'number', min: 0, max: 100, step: '0.1', placeholder: 'Raw similarity %' }),
      plUn: h('input', { type: 'checkbox', class: 'check', id: 'plun' + taskId }),
      grProv: h('input', { placeholder: 'Grammar tool ka naam (Grammarly...)', maxlength: 60 }), grScore: h('input', { type: 'number', min: 0, max: 100, step: '0.1', placeholder: 'Grammar %' }),
      factOk: h('input', { type: 'checkbox', class: 'check', id: 'fact' + taskId }), feedback: h('textarea', { rows: 3, placeholder: 'Detector / checker ne kya bataya? (flag hue paragraph, similarity ke sources...)' }),
    };
    const srcRows = j.sources.map((s) => ({ ...s }));
    const srcBox = h('div');
    const drawSources = () => put(srcBox, srcRows.map((s, i) => h('div', { class: 'row wrap', style: 'margin-bottom:6px' },
      h('input', { value: s.name, placeholder: 'Source ka naam', onchange: (e) => { s.name = e.target.value; } }), h('input', { value: s.url, placeholder: 'https://...', onchange: (e) => { s.url = e.target.value; } }),
      h('input', { value: s.info_used, placeholder: 'Kis tathya ke liye', onchange: (e) => { s.info_used = e.target.value; } }),
      h('select', { onchange: (e) => { s.source_type = e.target.value; } }, ['Official', 'Research', 'News', 'Other'].map((t) => h('option', { value: t, selected: s.source_type === t }, t))),
      h('select', { onchange: (e) => { s.reliability = e.target.value; } }, ['Verified', 'Needs Review'].map((t) => h('option', { value: t, selected: s.reliability === t }, t))),
      h('button', { type: 'button', class: 'ghost small', onclick: () => { srcRows.splice(i, 1); drawSources(); } }, 'Hatao'))));
    drawSources();

    const consent = h('input', { type: 'checkbox', class: 'check', id: 'consent' + taskId, checked: j.consent, onchange: (e) => run(() => api('content_consent', { allowed: e.target.checked })) });
    const mode = h('select', { 'aria-label': 'Mode', onchange: (e) => run(() => api('content_gate_mode', { id: taskId, mode: e.target.value })) },
      h('option', { value: 'strict', selected: g.mode === 'strict' }, 'Strict mode (approve ho sakta hai)'), h('option', { value: 'review', selected: g.mode === 'review' }, 'Review mode (sirf report, approve nahi)'));

    put(box, 
      h('div', { class: 'row wrap' }, h('b', null, 'Version ' + viewing + (viewing !== j.current_version ? ' (purana, sirf dekhne ke liye)' : '')), gateChip(g.status), h('span', { class: 'muted' }, g.label),
        g.manual_review ? h('span', { class: 'tag bad' }, 'MANUAL REVIEW REQUIRED') : null, mode),
      h('div', { class: 'row' }, consent, h('label', { for: 'consent' + taskId }, 'Bahari provider allow karo: grammar check ke liye article ka text LanguageTool ko jayega (band rakhoge to text bahar nahi jayega)')),
      row('grammar', h('button', { class: 'ghost small', onclick: () => run(() => api('content_grammar_run', { id: taskId })) }, 'LanguageTool se check'),
        h('button', { class: 'ghost small', onclick: () => run(() => api('content_grammar_run', { id: taskId, auto_fix: true })) }, 'Check + auto sudhaar')),
      h('div', { class: 'row wrap' }, f.grProv, f.grScore, h('button', { class: 'ghost small', onclick: () => run(() => api('content_evidence', { id: taskId, type: 'grammar', provider: f.grProv.value, score: f.grScore.value })) }, 'Apna grammar result daalo')),
      row('ai_detection', h('button', { class: 'ghost small', onclick: () => run(() => api('content_ai_run', { id: taskId })) }, 'Sapling se AI check')),
      h('div', { class: 'row wrap' }, f.aiProv, f.aiScore, h('div', { class: 'row' }, f.aiLang, h('label', { for: 'ailang' + taskId }, 'Tool ne is bhasha ko support kiya')),
        h('button', { class: 'ghost small', onclick: () => run(() => api('content_evidence', { id: taskId, type: 'ai_detection', provider: f.aiProv.value, score: f.aiScore.value, language_supported: f.aiLang.checked })) }, 'AI detector ka asli result daalo')),
      row('plagiarism'),
      h('div', { class: 'row wrap' }, f.plProv, f.plScore, h('div', { class: 'row' }, f.plUn, h('label', { for: 'plun' + taskId }, 'Bina shrey ke copy mili')),
        h('button', { class: 'ghost small', onclick: () => run(() => api('content_evidence', { id: taskId, type: 'plagiarism', provider: f.plProv.value, score: f.plScore.value, unattributed: f.plUn.checked })) }, 'Plagiarism ka asli result daalo')),
      row('factual'), h('p', { class: 'muted' }, 'Source register (har tathya ka source, link aur tareekh):'), srcBox,
      h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'ghost small', onclick: () => { srcRows.push({ name: '', url: '', info_used: '', source_type: 'Other', reliability: 'Needs Review' }); drawSources(); } }, '+ Source'),
        h('div', { class: 'row' }, f.factOk, h('label', { for: 'fact' + taskId }, 'Maine tathya aur sources check kar liye')),
        h('button', { class: 'ghost small', onclick: () => run(async () => { await api('content_sources_save', { id: taskId, sources: srcRows.map((s) => ({ ...s, accessed: s.accessed || new Date().toISOString().slice(0, 10) })) }); if (f.factOk.checked) await api('content_evidence', { id: taskId, type: 'factual', confirmed: true }); }) }, 'Sources save + confirm')),
      row('evidence'),
      j.grammar_findings.length ? h('div', null, h('p', { class: 'muted' }, 'Grammar provider ne ye milaya:'), j.grammar_findings.slice(0, 8).map((x) => h('div', { class: 'muted' }, '• ' + x.context + ' → ' + x.message + (x.suggest.length ? ' (' + x.suggest.join(' / ') + ')' : '')))) : null,
      h('h2', null, 'Sudhaar (' + g.cycles + '/3 cycle)'), f.feedback,
      h('div', { class: 'row wrap', style: 'margin-top:8px' }, h('button', { disabled: g.cycles >= 3, onclick: () => run(() => api('content_revise', { id: taskId, feedback: f.feedback.value })) }, 'Sudhaar cycle chalao (naya version banega)'),
        viewing !== j.current_version ? h('button', { class: 'ghost', onclick: () => run(() => api('content_save_version', { id: taskId, body: doc.body, reason: 'Version ' + viewing + ' par wapas' })) }, 'Is version par wapas jao') : null),
      h('h2', null, 'Owner approval'),
      h('div', { class: 'row wrap' },
        g.can_approve && !g.owner_approved ? h('button', { onclick: () => run(() => api('content_approve', { id: taskId, step: 'approve' })) }, 'Maine dekh liya: approve karo') : null,
        g.owner_approved && !g.publish_authorized ? h('button', { onclick: () => { if (confirm('Publish allow? (Sirf record hoga, Jarvis kahin kuch nahi bhejta.)')) run(() => api('content_approve', { id: taskId, step: 'authorize_publish' })); } }, 'Publish allow karo (sirf record)') : null,
        g.owner_approved ? h('button', { class: 'ghost', onclick: () => run(() => api('content_approve', { id: taskId, step: 'revoke' })) }, 'Approval wapas lo') : null,
        g.publish_authorized ? h('span', { class: 'tag accent' }, 'PUBLISH AUTHORIZED (kuch bheja nahi gaya)') : null,
        !g.can_approve && !g.owner_approved ? h('span', { class: 'muted' }, g.mode !== 'strict' ? 'Review mode me approve nahi hota.' : 'Approve tab hoga jab sab zaroori jaanch PASS ho.') : null),
      h('h2', null, 'Versions (koi delete nahi hota)'),
      j.versions.map((v) => h('div', { class: 'item' }, h('div', { class: 'grow' }, 'v' + v.version + ' · ' + v.reason, h('div', { class: 'muted' }, timeAgo(v.created_at))),
        h('button', { class: 'ghost small', onclick: () => load(v.version) }, 'Dekho'))),
      h('h2', null, 'Audit'), j.audit.slice(0, 10).map((a) => h('div', { class: 'muted' }, timeAgo(a.created_at) + ' · ' + a.action + ' · ' + a.detail)), msg);
  }
  load().catch((x) => { put(box, h('p', { class: 'error' }, x.message)); });
  return box;
}

// ---------- Class tab: language tutor (learners, daily lesson, speaking + writing practice, revision quiz, progress) ----------
const LEARN_LANGS = ['English', 'French', 'German', 'Spanish', 'Hindi', 'Arabic', 'Japanese', 'Tamil', 'Other'];
const LEARN_LEVELS = { A0: 'Kuch nahi aata', A1: 'Kuch shabd aate hain', A2: 'Chhote vakya bol leta hai', B1: 'Baat-cheet kar leta hai', B2: 'Achha bolta hai', C1: 'Bahut achha' };
const LEARN_DAYS = [['mon', 'Som'], ['tue', 'Mangal'], ['wed', 'Budh'], ['thu', 'Guru'], ['fri', 'Shukra'], ['sat', 'Shani'], ['sun', 'Ravi']];
const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs, text) {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

/** Draws a lesson diagram from the validated data (boxes / flow / timeline / map). Text goes in through textContent only. */
function drawDiagram(spec) {
  const items = spec.items || [];
  const W = 120, H = 56, GAP = 38, PER = 4;
  let svg;
  const label = (x, y, t, cls, size) => svgEl('text', { x, y, 'text-anchor': 'middle', class: cls, 'font-size': size || 13 }, t.length > 16 ? t.slice(0, 15) + '…' : t);
  if (spec.type === 'timeline') {
    const w = Math.max(items.length * 130, 300);
    svg = svgEl('svg', { viewBox: `0 0 ${w} 120`, class: 'dia' });
    svg.append(svgEl('line', { x1: 20, y1: 60, x2: w - 20, y2: 60, class: 'dia-line' }));
    items.forEach((it, i) => {
      const x = 40 + i * ((w - 80) / Math.max(items.length - 1, 1));
      svg.append(svgEl('circle', { cx: x, cy: 60, r: 7, class: 'dia-dot' }), label(x, 38, it.label, 'dia-text', 14), label(x, 88, it.sub, 'dia-sub', 12));
    });
  } else if (spec.type === 'map') {
    svg = svgEl('svg', { viewBox: '0 0 360 260', class: 'dia' });
    const c = items[0];
    const rest = items.slice(1);
    rest.forEach((it, i) => {
      const a = (Math.PI * 2 * i) / Math.max(rest.length, 1) - Math.PI / 2;
      const x = 180 + Math.cos(a) * 125, y = 130 + Math.sin(a) * 90;
      svg.append(svgEl('line', { x1: 180, y1: 130, x2: x, y2: y, class: 'dia-line' }), svgEl('rect', { x: x - 52, y: y - 22, width: 104, height: 44, rx: 10, class: 'dia-box' }),
        label(x, y - 2, it.label, 'dia-text'), label(x, y + 14, it.sub, 'dia-sub', 11));
    });
    svg.append(svgEl('rect', { x: 130, y: 105, width: 100, height: 50, rx: 12, class: 'dia-box dia-main' }), label(180, 127, c.label, 'dia-text', 15), label(180, 144, c.sub, 'dia-sub', 11));
  } else {
    const rows = Math.ceil(items.length / PER);
    const perRow = Math.min(items.length, PER);
    svg = svgEl('svg', { viewBox: `0 0 ${perRow * (W + GAP)} ${rows * (H + 30)}`, class: 'dia' });
    items.forEach((it, i) => {
      const r = Math.floor(i / PER), col = i % PER;
      const x = col * (W + GAP) + 4, y = r * (H + 30) + 6;
      svg.append(svgEl('rect', { x, y, width: W, height: H, rx: 10, class: 'dia-box' }), label(x + W / 2, y + 24, it.label, 'dia-text', 15), label(x + W / 2, y + 43, it.sub, 'dia-sub', 11));
      if (col < PER - 1 && i < items.length - 1) {
        const mx = x + W + GAP / 2;
        svg.append(spec.type === 'flow'
          ? svgEl('path', { d: `M${x + W + 6} ${y + H / 2} h${GAP - 12} m-6 -5 l6 5 l-6 5`, class: 'dia-arrow' })
          : svgEl('text', { x: mx, y: y + H / 2 + 6, 'text-anchor': 'middle', class: 'dia-text', 'font-size': 20 }, '+'));
      }
    });
  }
  return h('div', { class: 'diagram' }, spec.title ? h('div', { class: 'muted' }, spec.title) : null, svg);
}

/** 14-day bars: height = average score of that day, empty days are faint. */
function drawProgress(days) {
  const keys = Object.keys(days);
  const svg = svgEl('svg', { viewBox: '0 0 420 130', class: 'dia' });
  svg.append(svgEl('line', { x1: 10, y1: 100, x2: 410, y2: 100, class: 'dia-line' }));
  keys.forEach((d, i) => {
    const x = 14 + i * 28, v = days[d];
    const hh = v.avg == null ? 3 : Math.max(4, (v.avg / 100) * 90);
    const bar = svgEl('rect', { x, y: 100 - hh, width: 20, height: hh, rx: 4, class: v.avg == null ? 'bar-empty' : 'bar' });
    bar.append(svgEl('title', {}, d + (v.avg == null ? ': kuch nahi kiya' : ': ' + v.n + ' practice, average ' + v.avg)));
    svg.append(bar, svgEl('text', { x: x + 10, y: 118, 'text-anchor': 'middle', class: 'dia-sub', 'font-size': 10 }, d.slice(8)));
  });
  return h('div', { class: 'diagram' }, svg);
}

function tutorSay(text, lang, rate) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate || 0.85;
    const voice = speechSynthesis.getVoices().find((v) => v.lang === lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch (_) { /* no speech on this device */ }
}

function tutorListen(lang, onText, onFail) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onFail('Is browser me bolkar jawab dene ki suvidha nahi hai (Chrome use karo). Likh kar bhi practice ho sakti hai.'); return; }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => onText(e.results[0][0].transcript);
  rec.onerror = (e) => onFail(e.error === 'not-allowed' ? 'Mic ki ijazat do (browser me mic allow karo).' : 'Awaaz samajh nahi aayi, dobara bolo.');
  rec.start();
}

function feedbackBox(fb) {
  return h('div', { class: 'card' },
    h('p', { class: 'tag accent' }, 'Score: ' + fb.score + '/100'),
    fb.praise ? h('p', null, fb.praise) : null,
    h('p', null, h('b', null, 'Sahi vakya: '), fb.corrected),
    fb.mistakes.map((m) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('span', { class: 'error' }, m.wrong), ' → ', h('b', null, m.right), h('div', { class: 'muted' }, m.why)))),
    fb.better.length ? h('p', { class: 'muted' }, 'Aur tareeke: ' + fb.better.join(' | ')) : null,
    fb.next_tip ? h('p', { class: 'muted' }, 'Kal ke liye: ' + fb.next_tip) : null);
}

function viewLearn(view) {
  let learners = [];
  let current = null;
  let editing = null; // null = list, 0 = new, id = edit
  const msg = h('div', { class: 'error', role: 'alert' });
  const area = h('div');

  async function loadList() {
    const r = await api('learn_learners');
    learners = r.learners;
    draw();
  }

  function learnerForm(l) {
    const f = {
      name: h('input', { maxlength: 60, value: l ? l.name : '', placeholder: 'Sikhne wale ka naam', 'aria-label': 'Naam' }),
      native: h('input', { maxlength: 30, value: l ? l.native : 'Hindi', 'aria-label': 'Pehli bhasha' }),
      target: h('select', { 'aria-label': 'Kya seekhna hai' }, LEARN_LANGS.map((x) => h('option', { value: x, selected: l ? (LEARN_LANGS.includes(l.target) ? l.target === x : x === 'Other') : x === 'English' }, x))),
      other: h('input', { maxlength: 30, placeholder: 'Bhasha ka naam', value: l && !LEARN_LANGS.includes(l.target) ? l.target : '', 'aria-label': 'Dusri bhasha' }),
      variant: h('input', { maxlength: 30, value: l ? l.variant : 'American', placeholder: 'American / British / Indian / Australian (English ke liye)', 'aria-label': 'Accent' }),
      level: h('select', { 'aria-label': 'Level' }, Object.entries(LEARN_LEVELS).map(([k, v]) => h('option', { value: k, selected: (l ? l.level : 'A0') === k }, k + ': ' + v))),
      goal: h('input', { maxlength: 200, value: l ? l.goal : '', placeholder: 'Kis kaam ke liye: dukaan, naukri, mobile, safar...', 'aria-label': 'Maksad' }),
      time: h('input', { type: 'time', value: l ? l.class_time : '07:00', 'aria-label': 'Class ka time' }),
      minutes: h('select', { 'aria-label': 'Class kitne minute' }, [15, 20, 30, 45, 60, 90].map((m) => h('option', { value: m, selected: (l ? l.class_minutes : 30) === m }, m + ' minute'))),
    };
    const picked = new Set(l ? l.class_days.split(',').filter(Boolean) : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    const dayBoxes = LEARN_DAYS.map(([k, label]) => h('label', { class: 'row', style: 'gap:4px' },
      h('input', { type: 'checkbox', class: 'check', checked: picked.has(k), onchange: (e) => { e.target.checked ? picked.add(k) : picked.delete(k); } }), label));
    return h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      msg.textContent = '';
      try {
        await api('learn_learner_save', { id: l ? l.id : 0, name: f.name.value, native: f.native.value, target: f.target.value === 'Other' ? f.other.value : f.target.value, variant: f.variant.value,
          level: f.level.value, goal: f.goal.value, class_time: f.time.value, class_minutes: Number(f.minutes.value), class_days: [...picked] });
        editing = null;
        loadList();
      } catch (x) { msg.textContent = x.message; }
    } },
      h('p', { class: 'muted' }, 'Pehle trainer se poochho: kaun sikhega aur abhi kitna aata hai? Class kis time aur kitne minute ki karoge, kin dino? American ya British English (ya koi aur bhasha)? Kis kaam ke liye? Phir yahan bharo.'),
      h('label', null, 'Naam'), f.name, h('label', null, 'Pehli bhasha (jisme samjhana hai)'), f.native,
      h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('label', null, 'Kya seekhna hai'), f.target), h('div', { class: 'grow' }, h('label', null, 'Agar "Other" to naam'), f.other)),
      h('label', null, 'Accent / variety'), f.variant, h('label', null, 'Abhi kitna aata hai'), f.level, h('label', null, 'Maksad'), f.goal,
      h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('label', null, 'Class ka time'), f.time), h('div', { class: 'grow' }, h('label', null, 'Class kitne minute ki'), f.minutes)),
      h('label', null, 'Kin dino'), h('div', { class: 'row wrap' }, dayBoxes), msg,
      h('div', { class: 'row wrap' }, h('button', { type: 'submit' }, 'Save'), h('button', { type: 'button', class: 'ghost', onclick: () => { editing = null; draw(); } }, 'Cancel')));
  }

  function draw() {
    if (editing !== null) { put(area, learnerForm(editing ? learners.find((x) => x.id === editing) : null)); return; }
    if (current) { openClass(current); return; }
    put(area, 
      ...learners.map((l) => h('div', { class: 'card' },
        h('h2', null, l.name),
        h('div', { class: 'muted' }, l.target + (l.variant ? ' (' + l.variant + ')' : '') + ' · level ' + l.level + ' · ' + (l.class_minutes ? 'class ' + l.class_time + ', ' + l.class_minutes + ' minute' : 'class ka time tay nahi')),
        h('div', { class: 'muted' }, 'Streak: ' + l.streak + ' din · shabd: ' + l.words_total + ' · revision baaki: ' + l.due_now),
        h('div', { class: 'row wrap', style: 'margin-top:8px' },
          h('button', { onclick: () => { current = l; draw(); } }, 'Aaj ki class shuru karo'),
          h('button', { class: 'ghost', onclick: () => { editing = l.id; draw(); } }, 'Edit'),
          h('button', { class: 'ghost danger', onclick: async () => { if (confirm(l.name + ' ko hata dein? Iska poora record jayega.')) { await api('learn_learner_delete', { id: l.id }); loadList(); } } }, 'Hatao')))),
      learners.length ? null : h('p', { class: 'muted' }, 'Abhi koi learner nahi hai. Neeche se naya jodo.'),
      h('button', { onclick: () => { editing = 0; draw(); } }, '+ Naya learner'));
  }

  async function openClass(l) {
    const box = h('div', null, h('p', { class: 'muted' }, 'Aaj ka lesson ban raha hai... (pehli baar 20-40 second lagte hain)'));
    put(area, h('button', { class: 'ghost', onclick: () => { current = null; loadList(); } }, '← Sab learners'), h('h2', null, l.name + ' ki class'), box);
    let data;
    try { data = await api('learn_lesson&id=' + l.id); } catch (x) { put(box, h('p', { class: 'error' }, x.message)); return; }
    const L = data.lesson, lang = data.learner.tts_lang;
    const feedback = h('div');
    const practise = async (kind, prompt, answer) => {
      put(feedback, h('p', { class: 'muted' }, 'Check ho raha hai...'));
      try { put(feedback, feedbackBox(await api('learn_correct', { id: l.id, kind, prompt, answer }))); loadProgress(); } catch (x) { put(feedback, h('p', { class: 'error' }, x.message)); }
    };
    const speakAnswer = (prompt) => tutorListen(lang, (t) => { put(feedback, h('p', null, 'Maine suna: ', h('b', null, t))); practise('speaking', prompt, t); }, (m) => put(feedback, h('p', { class: 'error' }, m)));
    const writing = h('textarea', { rows: 3, placeholder: 'Yahan likho...', 'aria-label': 'Likhna' });
    const quizBox = h('div');
    const progBox = h('div', { class: 'card' });

    async function loadProgress() {
      try {
        const p = await api('learn_progress&id=' + l.id);
        put(progBox, h('h2', null, 'Progress'),
          h('div', { class: 'row wrap' }, h('span', { class: 'tag accent' }, 'Streak: ' + p.streak + ' din'), h('span', { class: 'tag' }, 'Shabd: ' + p.words_total), h('span', { class: 'tag' }, 'Pakke: ' + p.mastered),
            h('span', { class: 'tag' }, 'Revision baaki: ' + p.due_now), h('span', { class: 'tag' }, p.accuracy_7d == null ? 'Accuracy: abhi nahi' : 'Accuracy (7 din): ' + p.accuracy_7d + '%')),
          drawProgress(p.days),
          p.repeat_mistakes.length ? h('p', { class: 'muted' }, 'Baar-baar hone wali galtiyan: ' + p.repeat_mistakes.join(' | ')) : null);
      } catch (_) { /* shown next time */ }
    }

    async function startQuiz() {
      const { questions } = await api('learn_quiz&id=' + l.id);
      if (!questions.length) { put(quizBox, h('p', { class: 'muted' }, 'Abhi koi shabd revision ke liye baaki nahi. Shabaash!')); return; }
      let i = 0, right = 0;
      const next = () => {
        if (i >= questions.length) { put(quizBox, h('p', { class: 'tag accent' }, right + '/' + questions.length + ' sahi. Kal phir milte hain!')); loadProgress(); return; }
        const q = questions[i];
        const result = h('div', { class: 'muted' });
        put(quizBox, h('div', { class: 'row' }, h('b', { style: 'font-size:1.4rem' }, q.word), q.pron ? h('span', { class: 'muted' }, ' (' + q.pron + ')') : null,
          h('button', { class: 'ghost small', onclick: () => tutorSay(q.word, lang) }, 'Suno')),
          h('p', { class: 'muted' }, 'Iska matlab kya hai?'),
          q.choices.map((c) => h('button', { class: 'ghost', style: 'display:block;width:100%;margin:6px 0', onclick: async (e) => {
            [...quizBox.querySelectorAll('button')].forEach((b) => { b.disabled = true; });
            const r = await api('learn_quiz_answer', { id: l.id, word_id: q.id, choice: c });
            right += r.correct ? 1 : 0;
            result.textContent = r.correct ? 'Sahi! Ye shabd ' + r.next_in_days + ' din baad phir poochha jayega.' : 'Galat. Sahi jawab: ' + r.answer + '. Ye kal phir aayega.';
            result.className = r.correct ? 'tag accent' : 'error';
            quizBox.append(h('button', { style: 'margin-top:8px', onclick: () => { i++; next(); } }, 'Aage'));
          } }, c)), result);
      };
      next();
    }

    put(box, 
      h('div', { class: 'card' }, h('h2', null, L.title), L.theme ? h('p', { class: 'tag' }, 'Aaj ka theme: ' + L.theme) : null, L.diagram ? drawDiagram(L.diagram) : null, L.tip ? h('p', { class: 'muted' }, 'Tip: ' + L.tip) : null),
      h('h2', null, 'Aaj ke 10 shabd'),
      h('div', { class: 'card' }, L.words.map((w) => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('b', { style: 'font-size:1.15rem' }, w.word), ' ', h('span', { class: 'muted' }, w.pron ? '(' + w.pron + ')' : ''), h('div', null, w.meaning),
          w.example ? h('div', { class: 'muted' }, w.example + (w.example_meaning ? ' = ' + w.example_meaning : '')) : null),
        h('button', { class: 'ghost small', onclick: () => tutorSay(w.word, lang) }, 'Suno'),
        h('button', { class: 'ghost small', onclick: () => speakAnswer('Say the word: ' + w.word) }, 'Bolo')))),
      h('h2', null, 'Bolne ke vakya (suno, phir bolo)'),
      h('div', { class: 'card' }, L.sentences.map((s) => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('b', null, s.text), s.pron ? h('div', { class: 'muted' }, s.pron) : null, h('div', null, s.meaning)),
        h('button', { class: 'ghost small', onclick: () => tutorSay(s.text, lang) }, 'Suno'),
        h('button', { class: 'ghost small', onclick: () => speakAnswer('Say: ' + s.text) }, 'Bolo')))),
      h('h2', null, 'Chhoti baat-cheet'),
      h('div', { class: 'card' }, L.dialogue.map((d) => h('div', { class: 'bubble ' + (d.who === 'A' ? 'a' : 'b') }, h('b', null, d.who + ': '), d.text, d.meaning ? h('div', { class: 'muted' }, d.meaning) : null)),
        h('button', { class: 'ghost small', onclick: () => tutorSay(L.dialogue.map((d) => d.text).join('. '), lang, 0.8) }, 'Poori baat-cheet suno')),
      h('h2', null, 'Likhne ki practice'), h('div', { class: 'card' }, h('p', null, L.writing_task), writing,
        h('div', { class: 'row wrap', style: 'margin-top:8px' }, h('button', { onclick: () => practise('writing', L.writing_task, writing.value) }, 'Check karo'))),
      h('h2', null, 'Bolne ki practice'), h('div', { class: 'card' }, h('p', null, L.speaking_task),
        h('div', { class: 'row wrap' }, h('button', { onclick: () => speakAnswer(L.speaking_task) }, 'Bolna shuru karo'))),
      feedback,
      h('h2', null, 'Revision'), h('div', { class: 'card' }, h('button', { onclick: startQuiz }, 'Purane shabdon ki revision shuru karo'), quizBox),
      progBox);
    loadProgress();
  }

  page(view, h('h2', null, 'Class: bhasha sikhna (roz thoda, aasaan shabdon se)'), area);
  loadList().catch((x) => { msg.textContent = x.message; });
}

function viewContent(view) {
  clearInterval(contentTimer);
  let selected = 0;
  let lastListSig = '';
  const msg = h('div', { class: 'error', role: 'alert' });
  const listBox = h('div', { class: 'card' });
  const detailBox = h('div');

  // --- 1. new content
  const f = {
    topic: h('textarea', { rows: 3, maxlength: 1200, placeholder: 'Kis bare me likhna hai? (jaise: small shops par payment fail kyu hota hai aur kya karein)', 'aria-label': 'Topic' }),
    keyword: h('input', { maxlength: 80, placeholder: 'jaise: payment failed', 'aria-label': 'Focus keyword' }),
    brand: h('input', { maxlength: 80, value: 'Wisi Pay', 'aria-label': 'Brand' }),
    language: h('select', { 'aria-label': 'Language' }, ['English', 'Hinglish', 'Hindi'].map((l) => h('option', { value: l }, l))),
    words: h('input', { type: 'number', min: 300, max: 2500, value: 900, 'aria-label': 'Words' }),
    audience: h('input', { maxlength: 200, placeholder: 'jaise: small shop owners in India', 'aria-label': 'Audience' }),
    pages: h('textarea', { rows: 3, maxlength: 800, placeholder: 'Internal pages jahan link karna hai, ek line me ek: /blog/online-payments', 'aria-label': 'Internal pages' }),
    notes: h('input', { maxlength: 800, placeholder: 'Koi extra baat (optional)', 'aria-label': 'Notes' }),
  };
  const go = h('button', { type: 'submit' }, 'Likhwao');
  const newForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    msg.textContent = '';
    go.disabled = true;
    try {
      const r = await api('content_new', { topic: f.topic.value, focus_keyword: f.keyword.value, brand: f.brand.value, language: f.language.value,
        words: Number(f.words.value), audience: f.audience.value, pages: f.pages.value, notes: f.notes.value });
      selected = r.id;
      kickScheduler();
      await loadList();
      await loadDetail();
    } catch (x) { msg.textContent = x.message; }
    go.disabled = false;
  } },
    h('label', null, 'Topic'), f.topic,
    h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('label', null, 'Focus keyword'), f.keyword), h('div', { class: 'grow' }, h('label', null, 'Brand'), f.brand)),
    h('div', { class: 'row wrap' }, h('div', { class: 'grow' }, h('label', null, 'Language'), f.language), h('div', { class: 'grow' }, h('label', null, 'Words'), f.words)),
    h('label', null, 'Audience'), f.audience,
    h('label', null, 'Internal pages'), f.pages,
    h('label', null, 'Extra notes'), f.notes,
    msg, go,
    h('p', { class: 'muted' }, 'Jarvis aapke rules ke hisaab se likhta hai, program se check karta hai aur jo fail ho use sudharta hai (1-2 minute).'));

  // --- history + detail
  async function loadList() {
    const { items } = await api('content_list');
    const sig = JSON.stringify(items.map((t) => [t.id, t.status, t.pass, t.rounds, t.updated_at]));
    if (sig === lastListSig) return; // nothing changed: keep the buttons the owner is about to press
    lastListSig = sig;
    listBox.replaceChildren(...(items.length ? items.map((t) => {
      const doing = t.status === 'doing';
      const label = doing ? 'likh raha hoon...' : t.pass === true ? 'tayyar: sab checks pass' : t.pass === false ? 'tayyar: kuch checks fail' : t.status === 'todo' ? 'likh nahi paya (Kholo me wajah dekho)' : t.status;
      return h('div', { class: 'item' },
        h('div', { class: 'grow' }, t.title, h('div', { class: 'muted' }, label + (t.words ? ' · ' + t.words + ' words' : '') + (t.rounds ? ' · ' + t.rounds + ' round' : '') + ' · ' + timeAgo(t.updated_at))),
        h('button', { class: 'ghost small', onclick: () => { selected = t.id; loadDetail(); } }, 'Kholo'));
    }) : [h('p', { class: 'muted' }, 'Abhi koi content nahi hai. Upar se naya likhwao.')]));
  }

  async function loadDetail() {
    if (!selected) { detailBox.replaceChildren(); return; }
    const { task, result, last_log } = await api('content_get&id=' + selected);
    if (!result) {
      detailBox.replaceChildren(h('div', { class: 'card' }, h('h2', null, task.title),
        h('p', { class: 'muted' }, task.status === 'doing' ? 'Jarvis likh raha hai... (1-2 minute, ye page apne aap badlega)' : (last_log || 'Abhi koi result nahi hai.'))));
      return;
    }
    const d = result.doc;
    const body = h('textarea', { rows: 20, 'aria-label': 'Article' });
    body.value = d.body;
    const out = h('div');
    const recheck = async () => {
      try { out.replaceChildren(reportBox(await api('content_check', { focus_keyword: d.focus_keyword, seo_title: d.seo_title, meta_description: d.meta_description, slug: d.slug, body: body.value }))); }
      catch (x) { out.replaceChildren(h('p', { class: 'error' }, x.message)); }
    };
    out.replaceChildren(reportBox(result));
    detailBox.replaceChildren(h('div', { class: 'card' },
      h('h2', null, task.title),
      fieldWithCopy('Focus keyword', d.focus_keyword),
      fieldWithCopy('SEO title', d.seo_title, '(' + d.seo_title.length + ' akshar, chahiye 50-60)'),
      fieldWithCopy('Meta description', d.meta_description, '(' + d.meta_description.length + ' akshar, chahiye 120-155)'),
      fieldWithCopy('Slug', d.slug),
      h('label', null, 'Article (aap yahin badal sakte ho, phir "Dobara check" dabao)'), body,
      h('div', { class: 'row wrap', style: 'margin-top:8px' },
        h('button', { type: 'button', onclick: () => copyText(body.value) }, 'Article copy karo'),
        h('button', { type: 'button', class: 'ghost', onclick: recheck }, 'Dobara check'),
        h('a', { class: 'btn ghost', href: 'https://www.zerogpt.com/', target: '_blank', rel: 'noopener noreferrer', onclick: () => copyText(body.value) }, 'ZeroGPT kholo (article copy ho jayega)')),
      h('h2', null, 'Check report'), out,
      h('h2', null, 'Quality Gate (CQO): asli jaanch aur approval'), renderGate(task.id)));
  }

  // --- 2. own text
  const own = {
    keyword: h('input', { maxlength: 80, placeholder: 'Focus keyword', 'aria-label': 'Focus keyword' }),
    title: h('input', { maxlength: 200, placeholder: 'SEO title', 'aria-label': 'SEO title' }),
    meta: h('input', { maxlength: 400, placeholder: 'Meta description', 'aria-label': 'Meta description' }),
    slug: h('input', { maxlength: 120, placeholder: 'URL slug (jaise payment-failed-fixes)', 'aria-label': 'Slug' }),
    body: h('textarea', { rows: 10, placeholder: 'Apna article yahan paste karo (Markdown: ## heading, [link](/page), ![alt](/img.jpg))', 'aria-label': 'Your text' }),
  };
  const ownOut = h('div');
  const ownForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    try { ownOut.replaceChildren(reportBox(await api('content_check', { focus_keyword: own.keyword.value, seo_title: own.title.value, meta_description: own.meta.value, slug: own.slug.value, body: own.body.value }))); }
    catch (x) { ownOut.replaceChildren(h('p', { class: 'error' }, x.message)); }
  } }, own.keyword, own.title, own.meta, own.slug, own.body, h('button', { type: 'submit' }, 'Check karo (AI ke bina)'));

  // --- 3. rules editor
  const rulesBox = h('textarea', { rows: 18, 'aria-label': 'Content rules' });
  const rulesMsg = h('div', { class: 'muted' });
  const rulesNote = h('p', { class: 'muted' });
  async function loadRules() {
    const r = await api('content_rules');
    rulesBox.value = r.rules;
    rulesNote.textContent = r.edited ? 'Ye aapki badli hui copy hai (server par). "Default par wapas" dabane se code wali file wapas aa jayegi.' : 'Ye code ke saath aayi default file hai. Save karoge to aapki copy ban jayegi jo deploy se nahi badlegi.';
  }
  const rulesCard = h('div', { class: 'card' },
    h('p', { class: 'muted' }, 'Jarvis har content isi file ke hisaab se likhta hai. Yahan badlao to agle content se lagu. Program jo numbers check karta hai (jaise 50-60 characters, 30% transition words) code me hain; unhe badalna ho to mujhe batao.'),
    rulesBox, rulesNote,
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', onclick: async () => { try { const r = await api('content_rules_save', { rules: rulesBox.value }); rulesBox.value = r.rules; rulesMsg.textContent = 'Save ho gaya.'; loadRules(); } catch (x) { rulesMsg.textContent = x.message; } } }, 'Save'),
      h('button', { type: 'button', class: 'ghost', onclick: async () => { if (confirm('Default rules wapas laye?')) { try { await api('content_rules_save', { reset: true }); rulesMsg.textContent = 'Default wapas aa gaya.'; loadRules(); } catch (x) { rulesMsg.textContent = x.message; } } } }, 'Default par wapas')),
    rulesMsg);

  page(view,
    h('h2', null, 'Naya content likhwao'), h('div', { class: 'card' }, newForm),
    h('h2', null, 'Content Quality Center'), qualityDashboard(),
    h('h2', null, 'Provider Settings (AI detection, plagiarism)'), providerSettings(),
    h('h2', null, 'Mere content'), listBox, detailBox,
    h('h2', null, 'Apna text check karo'), h('div', { class: 'card' }, ownForm, ownOut),
    h('h2', null, 'Content rules (aapki file)'), rulesCard);
  loadList().catch(() => {});
  loadRules().catch(() => {});
  contentTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      await loadList();
      if (selected && !detailBox.querySelector('textarea')) await loadDetail(); // a draft that was still being written
    } catch (_) { /* next tick */ }
  }, 6000);
}

// ---------- boot ----------
async function boot() {
  clearInterval(timer);
  try {
    state = await api('state');
    if (state.setup_needed) showAuth(true);
    else if (!state.user) showAuth(false);
    else showApp();
  } catch (x) {
    root.replaceChildren(h('p', { class: 'error center' }, 'Server se connect nahi ho paya: ' + x.message));
  }
}
boot();

// ---------- Meri Library: your own PDFs, photos, videos, databases that Jarvis reads and remembers ----------
function viewLibrary(view) {
  const err = h('div', { class: 'error', role: 'alert' });
  const box = h('div', { class: 'card' });
  const list = h('div', { class: 'card' });
  const input = h('input', { type: 'file', multiple: true, style: 'display:none',
    accept: '.pdf,.jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.webm,.avi,.3gp,.mp3,.wav,.m4a,.aac,.ogg,.txt,.md,.csv,.json,.sql,.docx,.sqlite,.sqlite3,.db,.html,.xml,.py,.php,.js,.log' });
  const status = h('div', { class: 'muted' });
  const KIND = { pdf: 'PDF', image: 'Photo', video: 'Video', audio: 'Audio', text: 'Text', docx: 'Word', sqlite: 'Database' };
  const STATE = { queued: 'line me', reading: 'padh raha hoon...', ready: 'yaad ho gaya', failed: 'fail' };

  async function upload(file) {
    status.textContent = file.name + ': bhej raha hoon...';
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('api.php?r=library_upload', { method: 'POST', headers: { 'X-Requested-With': 'jarvis' }, body: fd });
    const j = await r.json().catch(() => ({ error: 'Server ne galat jawab diya' }));
    if (!r.ok) throw new Error(j.error || 'Upload fail');
    status.textContent = file.name + ': Jarvis padh raha hai (video/PDF me 1-3 minute lag sakte hain)...';
    await load();
    await api('library_process', { id: j.id });
  }

  async function load() {
    const { files } = await api('library');
    list.replaceChildren(
      h('h3', null, 'Aapki files (' + files.length + ')'),
      files.length ? null : h('p', { class: 'muted' }, 'Abhi kuch nahi. Upar se PDF, photo, video ya database jodo.'),
      ...files.map((f) => h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;gap:8px;margin:8px 0' },
        h('div', null,
          h('div', null, h('b', null, f.name), ' ', h('span', { class: 'muted' }, KIND[f.kind] + ' - ' + (f.size / 1048576).toFixed(1) + ' MB')),
          h('div', { class: 'muted' }, (STATE[f.status] || f.status) + (f.note ? ' - ' + f.note : '')),
          f.status === 'failed' ? h('button', { class: 'small ghost', onclick: async () => { try { await api('library_process', { id: f.id }); } catch (x) { err.textContent = x.message; } load(); } }, 'Dobara try') : null),
        h('button', { class: 'small ghost', onclick: async () => { if (confirm(f.name + ' hata dein?')) { await api('library_delete', { id: f.id }); load(); } } }, 'Hatao'))));
  }

  input.addEventListener('change', async () => {
    err.textContent = '';
    for (const f of [...input.files]) {
      try { await upload(f); } catch (x) { err.textContent = f.name + ': ' + x.message; }
    }
    input.value = '';
    status.textContent = '';
    load();
  });

  box.append(
    h('h3', null, 'Meri Library'),
    h('p', { class: 'muted' }, 'Apni modules, notes, PDF, photo, video, audio, Word, CSV ya database jodo. Jarvis ek baar padh kar yaad rakhta hai, phir chat me aap kuch bhi poochho to pehle isi me se jawab dhundhta hai. Files sirf aapke server par rehti hain.'),
    h('button', { onclick: () => input.click() }, 'File jodo'), input, status);
  view.append(box, err, list);
  load().catch((x) => { err.textContent = x.message; });
}

// ---------- Leads: campaigns, scripts, lead lists and the call simulator ----------
function viewLeads(view) {
  const err = h('div', { class: 'error', role: 'alert' });
  const camps = h('div');
  const body = h('div');
  const STATUS = { new: 'nayi', calling: 'call chal rahi', interested: 'interested', callback: 'baad me call', not_interested: 'interested nahi', do_not_call: 'call mat karo', wrong_number: 'galat number', no_answer: 'uthaya nahi', done: 'ho gaya' };
  let sel = null;

  const field = (label, el) => h('label', { style: 'display:block;margin:8px 0' }, h('span', { class: 'muted' }, label), el);

  async function loadCamps() {
    const { campaigns } = await api('campaigns');
    camps.replaceChildren(h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', null, 'Campaigns'), h('button', { class: 'small', onclick: () => openCampaign({}) }, '+ Naya')),
      campaigns.length ? null : h('p', { class: 'muted' }, 'Abhi koi campaign nahi. Naya banao: naam, script, aur leads ki Excel/CSV.'),
      ...campaigns.map((c) => h('div', { class: 'row', style: 'justify-content:space-between;margin:8px 0;gap:8px' },
        h('div', null, h('b', null, c.name), ' ', h('span', { class: 'muted' }, c.status === 'active' ? 'chal raha' : 'ruka hua'),
          h('div', { class: 'muted' }, c.leads + ' leads, ' + c.pending + ' baaki, ' + c.interested + ' interested')),
        h('button', { class: 'small ghost', onclick: () => openCampaign(c) }, 'Kholo')))));
  }

  async function openCampaign(c) {
    sel = c;
    const f = {
      name: h('input', { value: c.name || '', maxlength: 80 }),
      assistant: h('input', { value: c.assistant_name || 'Jarvis', maxlength: 40 }),
      gender: h('select', null, h('option', { value: 'f', selected: c.assistant_gender !== 'm' }, 'Ladki (rahi hoon)'), h('option', { value: 'm', selected: c.assistant_gender === 'm' }, 'Ladka (raha hoon)')),
      company: h('input', { value: c.company || '', maxlength: 80, placeholder: 'jaise: Udaypur Group' }),
      language: h('input', { value: c.language || 'Hinglish', maxlength: 30 }),
      script: h('textarea', { rows: 9, maxlength: 8000, placeholder: 'Kya bolna hai: offer, sawal, jawab. Jaise: "Hum real estate me plot bechte hain, rate 15 lakh se..., budget poochho, site visit ka time lo."' }),
      rules: h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Khaas niyam (optional): jaise "rate mat batana, sirf visit ke liye bulao"' }),
      from: h('input', { type: 'number', min: 0, max: 23, value: c.hour_from ?? 10, style: 'width:70px' }),
      to: h('input', { type: 'number', min: 1, max: 24, value: c.hour_to ?? 19, style: 'width:70px' }),
      active: h('input', { type: 'checkbox', class: 'check', checked: c.status === 'active' }),
    };
    f.script.value = c.script || '';
    f.rules.value = c.rules || '';
    const save = async () => {
      err.textContent = '';
      try {
        const r = await api('campaign_save', { id: c.id, name: f.name.value, assistant_name: f.assistant.value, assistant_gender: f.gender.value, company: f.company.value, language: f.language.value,
          script: f.script.value, rules: f.rules.value, hour_from: +f.from.value, hour_to: +f.to.value, status: f.active.checked ? 'active' : 'paused' });
        c.id = r.id;
        await loadCamps();
        openCampaign({ ...c, id: r.id, name: f.name.value, assistant_name: f.assistant.value, assistant_gender: f.gender.value, company: f.company.value, language: f.language.value, script: f.script.value, rules: f.rules.value, hour_from: +f.from.value, hour_to: +f.to.value, status: f.active.checked ? 'active' : 'paused' });
      } catch (x) { err.textContent = x.message; }
    };
    const file = h('input', { type: 'file', accept: '.csv,.xlsx', style: 'display:none' });
    file.addEventListener('change', async () => {
      if (!file.files[0] || !c.id) { err.textContent = 'Pehle campaign save karo'; return; }
      const fd = new FormData();
      fd.append('file', file.files[0]);
      fd.append('campaign_id', c.id);
      const r = await fetch('api.php?r=leads_import', { method: 'POST', headers: { 'X-Requested-With': 'jarvis' }, body: fd });
      const j = await r.json().catch(() => ({ error: 'Server ne galat jawab diya' }));
      err.textContent = r.ok ? '' : (j.error || 'Import fail');
      if (r.ok) { err.textContent = ''; alert(j.added + ' leads jude, ' + j.duplicates + ' duplicate, ' + j.skipped_bad_number + ' galat number chhode'); }
      file.value = '';
      openCampaign(c);
    });
    const leadsBox = h('div', { class: 'card' });
    const sim = simulator(c);
    body.replaceChildren(
      h('div', { class: 'card' },
        h('h3', null, c.id ? 'Campaign: ' + c.name : 'Naya campaign'),
        field('Campaign ka naam', f.name), field('Assistant ka naam (ye naam bolega)', f.assistant), field('Assistant ki awaaz', f.gender), field('Company / aapka naam', f.company),
        field('Bhasha', f.language), field('Script', f.script), field('Khaas niyam', f.rules),
        h('div', { class: 'row', style: 'gap:8px;align-items:center' }, h('span', { class: 'muted' }, 'Calling ka time (ghanta):'), f.from, h('span', null, 'se'), f.to, h('span', null, 'tak')),
        h('div', { class: 'row', style: 'gap:8px;margin:8px 0' }, f.active, h('span', null, 'Campaign chalu (laptop calls kar sakta hai)')),
        h('p', { class: 'muted' }, 'Har call ki shuruaat me assistant batata hai ki wo AI assistant hai. Ye hamesha rahega. Sirf unhe call jinhone enquiry ki; "call mat karo" bolne wale aage kabhi nahi.'),
        h('div', { class: 'row', style: 'gap:8px' }, h('button', { onclick: save }, 'Save'),
          c.id ? h('button', { class: 'ghost', onclick: () => file.click() }, 'Leads ki Excel/CSV jodo (naam, phone, gender)') : null, file,
          c.id ? h('button', { class: 'ghost', onclick: async () => { if (confirm('Campaign aur uske saare leads hata dein?')) { await api('campaign_delete', { id: c.id }); body.replaceChildren(); loadCamps(); } } }, 'Hatao') : null)),
      c.id ? sim : null, c.id ? leadsBox : null);
    if (c.id) loadLeads(leadsBox, c.id);
  }

  async function loadLeads(box, cid) {
    const { leads } = await api('leads&campaign_id=' + cid);
    box.replaceChildren(h('h3', null, 'Leads (' + leads.length + ')'),
      leads.length ? null : h('p', { class: 'muted' }, 'Excel jodo: pehli row me header (name, phone, gender).'),
      ...leads.map((l) => h('div', { style: 'margin:8px 0;border-bottom:1px solid var(--line);padding-bottom:6px' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:6px' },
          h('div', null, h('b', null, l.name || l.phone), ' ', h('span', { class: 'muted' }, l.phone + ' \u00b7 ' + (STATUS[l.status] || l.status) + (l.attempts ? ' \u00b7 ' + l.attempts + ' call' : ''))),
          h('div', { class: 'row', style: 'gap:4px' },
            h('button', { class: 'small ghost', onclick: async () => { const { calls } = await api('lead_calls&id=' + l.id); alert(calls.length ? calls.map((c) => new Date(c.started_at * 1000).toLocaleString() + '\n' + (c.summary || '') + '\n\n' + c.transcript).join('\n----\n') : 'Abhi koi call nahi hui'); } }, 'Baat'),
            h('button', { class: 'small ghost', onclick: async () => { await api('lead_update', { id: l.id, status: 'do_not_call' }); loadLeads(box, cid); } }, 'Call mat karo'))),
        l.summary ? h('div', { class: 'muted' }, l.summary) : null)));
  }

  // Test the script without any phone: you type what the person says, the call agent answers.
  function simulator(c) {
    const log = h('div', { style: 'max-height:260px;overflow:auto;margin:8px 0' });
    const input = h('input', { placeholder: 'Lead kya bolta hai? (jaise: haan boliye / rate kya hai / mujhe nahi chahiye)', style: 'width:100%' });
    const transcript = [];
    const gender = h('select', null, h('option', { value: 'm' }, 'sir'), h('option', { value: 'f' }, 'mam'), h('option', { value: '' }, 'pata nahi'));
    const name = h('input', { value: 'Rahul', style: 'width:110px' });
    const add = (who, text) => { log.append(h('div', { class: 'msg ' + (who === 'agent' ? 'assistant' : 'user') }, (who === 'agent' ? (c.assistant_name || 'Jarvis') + ': ' : 'Lead: ') + text)); log.scrollTop = log.scrollHeight; };
    const turn = async (said) => {
      const r = await api('call_simulate', { campaign_id: c.id, lead_name: name.value, gender: gender.value, transcript, said });
      transcript.push({ who: 'agent', text: r.say });
      add('agent', r.say + (r.end ? '  [call khatam' + (r.outcome ? ': ' + r.outcome : '') + ']' : ''));
      speak(r.say, true);
    };
    const start = h('button', { class: 'small', onclick: async () => { transcript.length = 0; log.replaceChildren(); try { await turn(''); } catch (x) { err.textContent = x.message; } } }, 'Naya test call');
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      const said = input.value.trim();
      input.value = '';
      transcript.push({ who: 'lead', text: said });
      add('lead', said);
      try { await turn(said); } catch (x) { err.textContent = x.message; }
    });
    return h('div', { class: 'card' }, h('h3', null, 'Script ka test (bina phone ke)'),
      h('p', { class: 'muted' }, 'Pehle save karo, phir "Naya test call". Aap lead ban kar likho, assistant jawab dega.'),
      h('div', { class: 'row', style: 'gap:8px;align-items:center' }, start, h('span', { class: 'muted' }, 'Lead:'), name, gender), log, input);
  }

  view.append(err, camps, body);
  loadCamps().catch((x) => { err.textContent = x.message; });
}

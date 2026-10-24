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

const TABS = [['chat', 'Chat'], ['tasks', 'Tasks'], ['report', 'Report'], ['notes', 'Notes'], ['devices', 'Devices'], ['skills', 'Seekha'], ['library', 'Library'], ['leads', 'Leads']];

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
  noteHook = null;
  hud = null;
  refreshTasks = null;
  devicesBox = recentBox = null;
  document.querySelectorAll('.nav').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  document.getElementById('title').textContent = TABS.find(([id]) => id === tab)[1];
  const view = document.getElementById('view');
  view.replaceChildren();
  ({ chat: viewChat, tasks: viewTasks, report: viewReport, notes: viewNotes, devices: viewDevices, skills: viewSkills, library: viewLibrary, leads: viewLeads })[tab](view);
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

// ---------- command center (status panel above the message box) ----------
let hud = null; // { el, update(status) } while the chat view is open

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
  const open = prefs.hud !== false && (prefs.hud === true || (window.innerWidth >= 900 && window.innerHeight >= 700));
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

  const add = (cls, text) => {
    if (empty) { empty.remove(); empty = null; }
    const m = h('div', { class: 'msg ' + cls }, text);
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
    hud.el.classList.add('listening');
    listen(async (t) => {
      if (!(await tryVoiceDecision(t))) send(t, true); // "haan"/"nahi" answers a waiting approval, anything else is chat
    }, () => { mic.classList.remove('live'); hud.el.classList.remove('listening'); });
  }
  mic.addEventListener('click', talk);

  hud = buildHud({
    talk,
    pcStatus: () => send('Mere PC ka status batao'),
    screen: () => send('Laptop par Claude ke sessions batao: kaun sa kaam chal raha hai aur kahan tak pahuncha'),
    newTask: () => { input.value = 'Task add karo: '; input.focus(); fit(); },
    stopAll: async () => { for (const p of [...pendingList]) await decide(p.route, p.id, false); note('Sab pending cancel kar diye.'); refreshHud(); },
  });
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
      h('div', { id: 'pending' }), hud.el, form,
      h('p', { class: 'hint' }, 'Risky kaam tabhi hote hain jab aap Approve karo. Mic aapke browser ki voice service se chalta hai.'))));

  api('chat_history').then(({ messages }) => {
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
  const out = h('div');
  const err = h('div', { class: 'error', role: 'alert' });
  const name = h('input', { placeholder: 'PC ka naam, jaise Home-PC', maxlength: 40, 'aria-label': 'PC agent name' });

  const pairOut = h('div');
  const pairErr = h('div', { class: 'error', role: 'alert' });
  const pairName = h('input', { placeholder: 'Device ka naam, jaise iPhone Office', maxlength: 40, 'aria-label': 'New device name', required: true });
  const pairType = typeSelect('iphone');
  const pairForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    pairErr.textContent = '';
    try {
      const r = await api('pair_create', { name: pairName.value, type: pairType.value });
      pairOut.replaceChildren(
        h('div', { class: 'pair-code mono', 'aria-label': 'Device code' }, r.code),
        h('p', { class: 'muted' }, r.name + ' par ' + location.origin + ' kholo, "Device code se jodo" dabao aur ye code daalo. 15 minute me ek hi baar chalega.'));
      pairName.value = '';
    } catch (x) { pairErr.textContent = x.message; }
  } }, pairName, pairType, pairErr, h('button', { type: 'submit' }, 'Code banao'));

  page(view,
    h('h2', null, 'Mere devices'), devicesBox,
    h('h2', null, 'Device ID aur Password'), deviceIdsCard(),
    h('h2', null, 'Naya device jodo (code se)'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Phone/TV par password type karne ki jagah ek baar ka code use karo.'),
      pairForm, pairOut),
    h('h2', null, 'Apps (download karke install karo)'), appsCard(),
    h('h2', null, 'PC agent jodo (purana tareeka: token)'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Windows app ho to upar wala code use karo. Ye sirf manual agent.py ke liye hai. Token sirf ek baar dikhega.'),
      h('form', { class: 'row', onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          const r = await api('agent_create', { name: name.value });
          const base = location.origin + location.pathname.replace(/[^/]*$/, '');
          out.replaceChildren(
            h('p', null, 'agent/config.json me ye daalo:'),
            h('pre', null, JSON.stringify({ server_url: base, token: r.token }, null, 2)));
          name.value = '';
          loadDevices();
        } catch (x) { err.textContent = x.message; }
      } }, name, h('button', { type: 'submit' }, 'Banao')),
      err, out),
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
  const name = h('input', { value: 'Laptop-PC', maxlength: 40, 'aria-label': 'PC ka naam' });
  const phoneName = h('input', { value: 'Phone', maxlength: 40, 'aria-label': 'Phone ka naam' });
  const phoneOut = h('div');

  api('downloads').then(({ files: fs }) => {
    files.replaceChildren(...(fs.length ? fs.map((f) => h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('div', null, f.label), h('div', { class: 'muted' }, (f.size / 1048576).toFixed(1) + ' MB · ' + fmtTime(f.date))),
      h('a', { class: 'btn', href: 'api.php?r=download&file=' + encodeURIComponent(f.file), download: f.file }, 'Download'))) :
      [h('p', { class: 'muted' }, 'Abhi koi app upload nahi hui.')]));
  }).catch((x) => { files.textContent = x.message; });

  return h('div', { class: 'card' },
    files,
    h('h2', null, 'Windows app jodne ke liye code'),
    h('p', { class: 'muted' }, 'Windows app kholo, ye code daalo. Code 15 minute me ek hi baar chalta hai.'),
    h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const r = await api('pair_create', { name: name.value, type: 'laptop', role: 'agent' });
        codeOut.replaceChildren(h('div', { class: 'pair-code mono' }, r.code));
      } catch (x) { err.textContent = x.message; }
    } }, name, h('button', { type: 'submit' }, 'Code banao')),
    err, codeOut,
    h('h2', null, 'Android app jodne ke liye code'),
    h('p', { class: 'muted' }, 'APK download karke install karo, app kholo aur ye code daalo. App phone ko Jarvis ka agent bana deti hai (YouTube, call, files).'),
    h('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const r = await api('pair_create', { name: phoneName.value, type: 'android', role: 'agent' });
        phoneOut.replaceChildren(h('div', { class: 'pair-code mono' }, r.code));
      } catch (x) { err.textContent = x.message; }
    } }, phoneName, h('button', { type: 'submit' }, 'Code banao')),
    phoneOut);
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

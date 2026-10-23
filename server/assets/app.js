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

function speak(text) {
  if (!prefs.speak || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = prefs.lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRec = null;

function listen(onText, onEnd) {
  if (!SR) return null;
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
    note('Ye risky hai (shutdown/restart). Screen par Approve tap karo.');
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
let pendingList = [];
const announced = new Set();
let noteHook = null;

const TABS = [['chat', 'Chat'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['devices', 'Devices']];

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
  timer = setInterval(tick, 4000);
}

function closeSide() {
  document.getElementById('side').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');
}

function renderView() {
  noteHook = null;
  hud = null;
  devicesBox = recentBox = null;
  document.querySelectorAll('.nav').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  document.getElementById('title').textContent = TABS.find(([id]) => id === tab)[1];
  const view = document.getElementById('view');
  view.replaceChildren();
  ({ chat: viewChat, tasks: viewTasks, notes: viewNotes, devices: viewDevices })[tab](view);
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
    const { commands, messages } = await api('commands');
    renderPending(commands, messages || []);
    refreshHud();
    if (tab === 'devices') { renderRecent(commands); loadDevices(); }
  } catch (x) { if (x.status === 401) boot(); }
}

function describe(c) {
  const a = c.args || {};
  const detail = a.url || a.app || a.text || '';
  return c.action + (detail ? ' → ' + detail : '') + ' (' + c.device + ')';
}

function renderPending(cmds, msgs) {
  pendingList = [
    ...cmds.filter((c) => c.status === 'awaiting_confirm').map((c) => ({
      route: 'command_decide', id: c.id, title: 'PC action: approval chahiye', text: describe(c),
      spoken: c.action.replace('_', ' ') + ' on ' + c.device, danger: ['shutdown', 'restart'].includes(c.action),
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
    const ok = s.ai.key_set;
    state.textContent = ok ? '● ONLINE' : '● AI KEY MISSING';
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
          h('span', { class: 'grow' }, t.title))))
        : h('p', { class: 'muted' }, 'Koi open task nahi.'));

    const core = hudCard('AI CORE', s.pending ? s.pending + ' PENDING' : 'STANDBY',
      h('dl', { class: 'hud-kv' },
        h('dt', null, 'Model'), h('dd', { class: 'mono' }, s.ai.model),
        h('dt', null, 'Claude'), h('dd', { class: s.ai.key_set ? 'good' : 'bad' }, s.ai.key_set ? 'Linked' : 'Key missing'),
        h('dt', null, 'Voice'), h('dd', { class: SR ? 'good' : 'bad' }, SR ? 'Ready' : 'Browser me nahi'),
        h('dt', null, 'WhatsApp'), h('dd', null, s.ai.contacts + ' contacts' + (s.ai.whatsapp ? ' · API' : ' · tap mode'))),
      h('button', { class: 'talk', type: 'button', onclick: actions.talk, disabled: !SR }, wave, h('span', null, 'TALK TO JARVIS')),
      h('div', { class: 'row wrap hud-actions' },
        h('button', { class: 'ghost small', type: 'button', onclick: actions.pcStatus }, 'PC status'),
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

  const add = (cls, text) => {
    if (empty) { empty.remove(); empty = null; }
    const m = h('div', { class: 'msg ' + cls }, text);
    scroll.append(m);
    scroll.scrollTop = scroll.scrollHeight;
    return m;
  };
  noteHook = (t) => add('note', t);

  async function send(text) {
    text = text.trim();
    if (!text) return;
    input.value = '';
    fit();
    add('user', text);
    const wait = add('assistant typing', null);
    wait.append(h('span'), h('span'), h('span'));
    try {
      const { reply, actions } = await api('chat', { text });
      wait.remove();
      add('assistant', reply);
      for (const a of actions || []) {
        // Only these schemes; the user's own tap on the link is the approval.
        if (!/^(tel:|whatsapp:|https:\/\/(wa\.me|www\.youtube\.com|www\.google\.com)\/)/.test(a.url)) continue;
        scroll.append(h('a', { class: 'btn', href: a.url, rel: 'noopener noreferrer' }, a.label));
      }
      scroll.scrollTop = scroll.scrollHeight;
      speak(reply);
      tick();
    } catch (x) {
      wait.remove();
      add('err', x.message);
    }
  }

  function fit() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    sendBtn.disabled = input.value.trim() === '';
  }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth >= 900) {
      e.preventDefault();
      send(input.value);
    }
  });

  function talk() {
    if (activeRec) { activeRec.stop(); return; }
    mic.classList.add('live');
    hud.el.classList.add('listening');
    listen(async (t) => {
      if (!(await tryVoiceDecision(t))) send(t); // "haan"/"nahi" answers a waiting approval, anything else is chat
    }, () => { mic.classList.remove('live'); hud.el.classList.remove('listening'); });
  }
  mic.addEventListener('click', talk);

  hud = buildHud({
    talk,
    pcStatus: () => send('Mere PC ka status batao'),
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

  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
    input,
    h('div', { class: 'row' }, spk, h('div', { class: 'row' }, mic, sendBtn)));

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

function viewTasks(view) {
  simpleList(view, {
    route: 'tasks', addRoute: 'task_add', field: 'title', placeholder: 'Naya task', max: 200,
    render: (reload) => (t) => h('div', { class: 'item' + (t.done ? ' done' : '') },
      h('input', { type: 'checkbox', class: 'check', checked: !!t.done, 'aria-label': 'Done',
        onchange: async (e) => { await api('task_toggle', { id: t.id, done: e.target.checked }); reload(); } }),
      h('div', { class: 'grow' }, t.title),
      h('button', { class: 'ghost small', onclick: async () => { await api('task_delete', { id: t.id }); reload(); } }, 'Delete')),
  });
}

function viewNotes(view) {
  simpleList(view, {
    route: 'notes', addRoute: 'note_add', field: 'body', placeholder: 'Naya note', max: 2000, multiline: true,
    render: (reload) => (n) => h('div', { class: 'item' },
      h('div', { class: 'grow', style: 'white-space:pre-wrap' }, n.body),
      h('button', { class: 'ghost small', onclick: async () => { await api('note_delete', { id: n.id }); reload(); } }, 'Delete')),
  });
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
    h('h2', null, 'Naya device jodo (code se)'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Phone/TV par password type karne ki jagah ek baar ka code use karo.'),
      pairForm, pairOut),
    h('h2', null, 'PC agent jodo'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Jis laptop/desktop ko control karna hai, uska ek token banao. Token sirf ek baar dikhega.'),
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
  recentBox.replaceChildren(...(cmds.length ? cmds.slice(0, 8).map((c) => h('div', { class: 'item' },
    h('div', { class: 'grow' }, h('div', { class: 'mono' }, describe(c)),
      c.result ? h('div', { class: 'muted' }, c.result) : null),
    h('span', { class: 'tag' }, c.status))) : [h('p', { class: 'muted' }, 'Abhi koi action nahi.')]));
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

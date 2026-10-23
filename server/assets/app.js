'use strict';

const root = document.getElementById('app');
const TYPE_LABEL = {
  laptop: 'Laptop', home_desktop: 'Home desktop', tv: 'TV', android: 'Android mobile',
  iphone: 'iPhone', work_android: 'Work Android', work_iphone: 'Work iPhone', other: 'Other',
};

// ---- helpers (all text goes through textContent, never innerHTML) ----
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v; // CSSOM is allowed by our CSP, style="" attributes are not
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
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
  return h('select', { name: 'device_type' }, Object.entries(TYPE_LABEL).map(
    ([k, v]) => h('option', { value: k, selected: k === value }, v)));
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return 'abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  return Math.floor(s / 86400) + ' din pehle';
}

// ---- auth screen ----
function showAuth(setup) {
  const err = h('div', { class: 'error', role: 'alert' });
  const type = guessType();
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const f = Object.fromEntries(new FormData(form));
      try {
        await api(setup ? 'setup' : 'login', f);
        boot();
      } catch (x) { err.textContent = x.message; }
    },
  },
    h('label', { for: 'u' }, 'Username'),
    h('input', { id: 'u', name: 'username', autocomplete: 'username', required: true }),
    h('label', { for: 'p' }, setup ? 'Password (kam se kam 12 akshar)' : 'Password'),
    h('input', { id: 'p', name: 'password', type: 'password', autocomplete: setup ? 'new-password' : 'current-password', required: true, minlength: setup ? 12 : 1 }),
    h('label', { for: 'dn' }, 'Is device ka naam'),
    h('input', { id: 'dn', name: 'device_name', value: TYPE_LABEL[type], maxlength: 40, required: true }),
    h('label', { for: 'dt' }, 'Device type'),
    typeSelect(type),
    err,
    h('button', { type: 'submit' }, setup ? 'Account banao' : 'Login'),
  );
  root.replaceChildren(h('div', { class: 'card' },
    h('h1', null, 'Jarvis'),
    h('p', { class: 'muted' }, setup ? 'Pehli baar setup: apna owner account banao.' : 'Login karo. Har device alag se register hota hai.'),
    form));
}

// ---- main app ----
let state = null;
let tab = 'chat';
let timer = null;

function showApp() {
  const pendingBox = h('div', { id: 'pending' });
  const panel = h('div', { id: 'panel' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [
    ['chat', 'Chat'], ['tasks', 'Tasks'], ['notes', 'Notes'], ['devices', 'Devices'],
  ].map(([id, label]) => h('button', {
    role: 'tab', 'aria-selected': String(tab === id), 'data-tab': id,
    onclick: () => { tab = id; showApp(); },
  }, label)));

  root.replaceChildren(
    h('div', { class: 'top' },
      h('div', null, h('h1', null, 'Jarvis'), h('div', { class: 'muted' }, state.user + ' · ' + state.device.name)),
      h('button', { class: 'ghost small', onclick: async () => { await api('logout', {}); boot(); } }, 'Logout')),
    pendingBox, tabs, panel);

  ({ chat: viewChat, tasks: viewTasks, notes: viewNotes, devices: viewDevices })[tab](panel);
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 4000);
}

async function tick() {
  if (document.hidden || !state) return;
  try {
    const { commands, messages } = await api('commands');
    renderPending(commands, messages);
    if (tab === 'devices') renderRecent(commands);
    if (tab === 'devices') loadDevices();
  } catch (x) { if (x.status === 401) boot(); }
}

function describe(c) {
  const a = c.args || {};
  const detail = a.url || a.app || a.text || '';
  return c.action + (detail ? ' → ' + detail : '') + ' (' + c.device + ')';
}

function renderPending(cmds, msgs) {
  const box = document.getElementById('pending');
  if (!box) return;
  const card = (title, text, onDecide) => h('div', { class: 'card pending' },
    h('div', { class: 'muted' }, title),
    h('div', { class: 'mono', style: 'white-space:pre-wrap' }, text),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'small', onclick: () => onDecide(true) }, 'Approve'),
      h('button', { class: 'small ghost', onclick: () => onDecide(false) }, 'Deny')));

  box.replaceChildren(
    ...cmds.filter((c) => c.status === 'awaiting_confirm')
      .map((c) => card('PC action: approval chahiye', describe(c), (ok) => decide('command_decide', c.id, ok))),
    ...(msgs || []).filter((m) => m.status === 'awaiting_confirm')
      .map((m) => card('WhatsApp → ' + m.contact + ': approval chahiye', m.body, (ok) => decide('message_decide', m.id, ok))));
}

async function decide(route, id, approve) {
  try {
    const r = await api(route, { id, approve });
    if (approve && r.result && route === 'message_decide') alert('WhatsApp: ' + r.result);
  } catch (x) { alert(x.message); }
  tick();
}

// ---- chat ----
function viewChat(panel) {
  const log = h('div', { class: 'log', 'aria-live': 'polite' });
  const input = h('input', { name: 'text', placeholder: 'Kuch bhi bolo ya likho…', maxlength: 2000, autocomplete: 'off', 'aria-label': 'Message' });
  const speakBox = h('input', { type: 'checkbox', id: 'spk', style: 'width:auto;margin:0' });
  const lang = h('select', { 'aria-label': 'Voice language', style: 'width:auto' },
    h('option', { value: 'hi-IN' }, 'Hindi'), h('option', { value: 'en-IN' }, 'English'));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  const add = (role, text) => {
    log.append(h('div', { class: 'msg ' + role }, text));
    log.scrollTop = log.scrollHeight;
  };

  async function send(text) {
    text = text.trim();
    if (!text) return;
    input.value = '';
    add('user', text);
    const wait = h('div', { class: 'msg assistant muted' }, '…');
    log.append(wait);
    try {
      const { reply, actions } = await api('chat', { text });
      wait.remove();
      add('assistant', reply);
      for (const a of actions || []) {
        // Only these schemes; a real tap on the link is the user's approval.
        if (!/^(tel:|whatsapp:|https:\/\/(wa\.me|www\.youtube\.com|www\.google\.com)\/)/.test(a.url)) continue;
        log.append(h('a', { class: 'btn', href: a.url, rel: 'noopener noreferrer' }, a.label));
      }
      log.scrollTop = log.scrollHeight;
      if (speakBox.checked && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(reply);
        u.lang = lang.value;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
      tick();
    } catch (x) {
      wait.remove();
      add('err', x.message);
    }
  }

  const mic = h('button', { type: 'button', class: 'ghost', 'aria-label': 'Bol kar likho', disabled: !SR }, 'Mic');
  mic.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = lang.value;
    rec.interimResults = false;
    rec.onresult = (ev) => send(ev.results[0][0].transcript);
    rec.onend = () => { rec = null; mic.textContent = 'Mic'; };
    rec.onerror = () => { rec = null; mic.textContent = 'Mic'; };
    mic.textContent = 'Sun raha hoon…';
    rec.start();
  });

  panel.append(
    log,
    h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
      input, mic, h('button', { type: 'submit' }, 'Bhejo')),
    h('div', { class: 'row wrap', style: 'margin-top:8px' },
      h('label', { class: 'row', for: 'spk' }, speakBox, 'Jawab bol kar sunao'),
      lang,
      h('button', { class: 'ghost small', onclick: async () => { await api('chat_clear', {}); log.replaceChildren(); } }, 'Chat saaf karo')),
    h('p', { class: 'muted' }, 'Mic aur bolna aapke browser ki apni service se hota hai (Chrome me Google). Server tak sirf text jata hai.'));

  api('chat_history').then(({ messages }) => messages.forEach((m) => add(m.role, m.content)))
    .catch((x) => add('err', x.message));
}

// ---- tasks & notes ----
function simpleList(panel, cfg) {
  const list = h('div', { class: 'card' });
  const err = h('div', { class: 'error', role: 'alert' });
  const input = h(cfg.multiline ? 'textarea' : 'input', { placeholder: cfg.placeholder, maxlength: cfg.max, 'aria-label': cfg.placeholder, rows: cfg.multiline ? 3 : undefined });

  async function load() {
    const data = await api(cfg.route);
    const rows = data[cfg.route];
    list.replaceChildren(...(rows.length ? rows.map(cfg.render(load)) : [h('p', { class: 'muted' }, 'Abhi kuch nahi.')]));
  }
  panel.append(
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
    h('div', { style: 'height:12px' }), list);
  load().catch((x) => { err.textContent = x.message; });
}

function viewTasks(panel) {
  simpleList(panel, {
    route: 'tasks', addRoute: 'task_add', field: 'title', placeholder: 'Naya task', max: 200,
    render: (reload) => (t) => h('div', { class: 'item' + (t.done ? ' done' : '') },
      h('input', { type: 'checkbox', checked: !!t.done, style: 'width:auto;margin:0', 'aria-label': 'Done',
        onchange: async (e) => { await api('task_toggle', { id: t.id, done: e.target.checked }); reload(); } }),
      h('div', { class: 'grow' }, t.title),
      h('button', { class: 'ghost small', onclick: async () => { await api('task_delete', { id: t.id }); reload(); } }, 'Delete')),
  });
}

function viewNotes(panel) {
  simpleList(panel, {
    route: 'notes', addRoute: 'note_add', field: 'body', placeholder: 'Naya note', max: 2000, multiline: true,
    render: (reload) => (n) => h('div', { class: 'item' },
      h('div', { class: 'grow', style: 'white-space:pre-wrap' }, n.body),
      h('button', { class: 'ghost small', onclick: async () => { await api('note_delete', { id: n.id }); reload(); } }, 'Delete')),
  });
}

// ---- devices ----
let devicesBox = null;
let recentBox = null;

function viewDevices(panel) {
  devicesBox = h('div', { class: 'card' });
  recentBox = h('div', { class: 'card' });
  const out = h('div');
  const err = h('div', { class: 'error', role: 'alert' });
  const name = h('input', { placeholder: 'PC ka naam, jaise Home-PC', maxlength: 40, 'aria-label': 'PC agent name' });

  panel.append(
    h('h2', null, 'Mere devices'), devicesBox,
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

// ---- boot ----
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

// Rack's interface. All data lives in the main process; this file draws it and sends requests back.
const R = window.rack;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const I = {
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  stack: '<path d="M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
  folder: '<path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  store: '<path d="M5 9h14l-1 10H6zM9 9V7a3 3 0 0 1 6 0v2"/>',
  chip: '<rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 9h6M9 12h6"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V7a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-4l-1.8-3a1.4 1.4 0 0 1 2.3-1.6L8 13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M4 12h16"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
  check: '<path d="M6 12l4 4 8-9"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>',
  img: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l5-5 4 4 2-2 4 3"/>',
  back: '<path d="M14 6l-6 6 6 6"/>',
  down: '<path d="M7 10l5 5 5-5"/>',
  redo: '<path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.8M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  eye: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  inbox: '<path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.4 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const SRC = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', battlenet: 'Battle.net', xbox: 'Xbox', folder: 'My folders', emulator: 'Emulators', manual: 'Added by hand' };
const SRC_SHORT = { steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', ea: 'EA', battlenet: 'Battle.net', xbox: 'Xbox', folder: 'Folder', manual: 'Manual' };
const SRC_ICON = { steam: 'store', epic: 'store', gog: 'store', ubisoft: 'store', ea: 'store', battlenet: 'store', xbox: 'store', folder: 'folder', emulator: 'chip', manual: 'hand' };
const STATUS = [['', 'No status'], ['playing', 'Playing'], ['backlog', 'Backlog'], ['completed', 'Completed'], ['dropped', 'Dropped']];
const STATUS_LABEL = Object.fromEntries(STATUS);
const DAY = 86400000;
const LISTS = [
  ['playing', 'Playing', 'flag', (g) => g.status === 'playing'],
  ['backlog', 'Backlog', 'inbox', (g) => g.status === 'backlog'],
  ['completed', 'Completed', 'check', (g) => g.status === 'completed'],
  ['dropped', 'Dropped', 'x', (g) => g.status === 'dropped'],
  ['never', 'Never played', 'sparkle', (g) => !g.total && !g.notInstalled],
  ['month', 'Played this month', 'clock', (g) => g.lastPlayed && g.lastPlayed > Date.now() - 30 * DAY],
  ['notinstalled', 'Not installed', 'cloud', (g) => g.notInstalled],
  ['hidden', 'Hidden', 'eye', (g) => g.hidden],
];

let S = null;           // the latest snapshot from the main process
const ui = {
  view: 'home', arg: null, back: null,
  preview: null, newCollection: false, sel: new Set(), anchor: null,
  sort: null, f: { source: '', status: '', genre: '' }, listSort: { key: 'name', dir: 1 },
  modal: null,
  detail: { id: null, draft: null, matches: null, matchError: null, confirmRemove: false, loading: false, uninstall: null, newAction: null },
  saves: {},
  scan: { stores: null, checked: new Set(), exeChoice: {}, results: {}, progress: {}, showSkipped: false, romForm: null, error: null, storesOn: {} },
  setup: { state: 'idle', res: null, on: {} },
  found: { checked: null },
};

/* ---------- appearance ---------- */

const ACCENTS = { mono: null, amber: '#f2b544', lime: '#a3e635', teal: '#2dd4bf', sky: '#38bdf8', violet: '#a78bfa', rose: '#fb7185' };
const ACCENT_NAMES = { mono: 'Mono', amber: 'Amber', lime: 'Lime', teal: 'Teal', sky: 'Sky', violet: 'Violet', rose: 'Rose', custom: 'Your colour' };
const DARK_SHADES = [['graphite', 'Graphite', '#1b1f27'], ['midnight', 'Midnight', '#0f1422'], ['black', 'Black', '#09090b'], ['warm', 'Warm', '#1d1a18']];
const LIGHT_SHADES = [['cool', 'Cool', '#eef0f3'], ['paper', 'Paper', '#f3efe7'], ['white', 'White', '#f8f9fa']];
const FONTS = [['rack', 'Rack', 'Wide titles, crisp text'], ['clean', 'Clean', 'One modern face'], ['arcade', 'Arcade', 'Squared, techy titles'], ['scifi', 'Sci-fi', 'Slanted, futuristic'], ['classic', 'Classic', 'The 1.0 look']];

const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function tune(c, bg, target, dark) {
  let x = c;
  for (let i = 0; i < 30 && contrast(x, bg) < target; i++) x = mix(x, dark ? [255, 255, 255] : [0, 0, 0], 0.07);
  return x;
}

function applyAppearance() {
  if (!S) return;
  const s = S.settings, root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.palette = dark ? `dark-${s.darkShade || 'graphite'}` : `light-${s.lightShade || 'cool'}`;
  root.dataset.font = s.font || 'rack';
  root.dataset.size = s.coverSize || 'm';
  const base = s.accent === 'custom' ? hex(s.accentCustom) : hex(ACCENTS[s.accent] || '');
  for (const k of ['--accent', '--accent-ink', '--accent-text', '--accent-soft']) root.style.removeProperty(k);
  if (base) {
    const bg = hex(getComputedStyle(root).getPropertyValue('--bg')) || (dark ? [27, 31, 39] : [238, 240, 243]);
    const a = tune(base, bg, 3, dark), t = tune(a, bg, 4.6, dark);
    const ink = contrast([12, 13, 16], a) >= contrast([255, 255, 255], a) ? '#0c0d10' : '#ffffff';
    root.style.setProperty('--accent', toHex(a));
    root.style.setProperty('--accent-ink', ink);
    root.style.setProperty('--accent-text', toHex(t));
    root.style.setProperty('--accent-soft', `rgba(${a.map(Math.round).join(',')},${dark ? 0.16 : 0.13})`);
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyAppearance());

/* ---------- helpers ---------- */

const byId = (id) => S.games.find((g) => g.id === id);
const hours = (min) => (!min ? 'Not played yet' : min < 60 ? `${min} min` : `${Math.round(min / 60).toLocaleString()} h`);
const hoursLong = (min) => (!min ? 'Not played yet' : min < 60 ? `${min} minutes` : `${Math.round(min / 60).toLocaleString()} hours`);
const clock = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
function ago(ms, short = false) {
  if (!ms) return 'Never';
  const d = new Date(ms), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / DAY);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return short ? 'Today' : `Today, ${time}`;
  if (days === 1) return short ? 'Yesterday' : `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}
const sourceLabel = (g) => (g.source === 'emulator' ? g.platform || 'Emulator' : SRC_SHORT[g.source] || 'Game');
const runningIds = () => (S.running || []).map((r) => r.id);
const isRunning = (g) => runningIds().includes(g.id);
const isLaunching = (g) => S.launching.includes(g.id) && !isRunning(g);
const isUninstalling = (g) => (S.uninstalling || []).includes(g.id);
const visible = (g) => !g.hidden && !g.notInstalled;
function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

const coverUrl = (g) => (g && g.cover ? `${window.RACK_COVER_BASE || 'rack://cover/'}${encodeURIComponent(g.cover)}` : '');
function coverHTML(g, { src = true, state = true } = {}) {
  const art = g.cover
    ? `<img src="${coverUrl(g)}" alt="" loading="lazy" draggable="false">`
    : `<div class="ph" style="background:linear-gradient(160deg,hsl(${hue(g.name)} 26% 34%),hsl(${(hue(g.name) + 40) % 360} 30% 18%))">${esc(g.name)}</div>`;
  const st = !state ? '' : g.missing ? '<span class="state">Missing</span>' : isRunning(g) ? '<span class="state go">Playing</span>'
    : isLaunching(g) ? '<span class="state">Starting</span>' : isUninstalling(g) ? '<span class="state">Uninstalling</span>' : g.notInstalled ? '<span class="state">Not installed</span>' : '';
  return `<div class="cover${g.missing ? ' missing' : ''}${g.notInstalled ? ' notinst' : ''}">${art}${src ? `<span class="src">${esc(sourceLabel(g))}</span>` : ''}${st}</div>`;
}

function tile(g, sub) {
  const sel = ui.sel.has(g.id) ? ' sel' : '';
  return `<div class="tile${sel}" data-gid="${g.id}">
    <div class="art"><button class="hit" data-act="open" data-id="${g.id}" data-fk="t:${g.id}" aria-label="${esc(g.name)}">${coverHTML(g)}</button>
    ${g.missing ? '' : `<button class="play" data-act="play" data-id="${g.id}" tabindex="-1" aria-label="${g.notInstalled ? 'Install' : 'Play'} ${esc(g.name)}" title="${g.notInstalled ? 'Install with Steam' : 'Play'}">${ic(g.notInstalled ? 'down' : 'play')}</button>`}</div>
    <p title="${esc(g.name)}">${esc(g.name)}</p>${sub || ''}</div>`;
}

const mostPlayed = () => S.games.filter((g) => visible(g) && g.total > 0).sort((a, b) => b.total - a.total);
const recentAdded = () => S.games.filter(visible).sort((a, b) => b.added - a.added);
const jumpBackIn = () => S.games.filter((g) => visible(g) && g.lastPlayed && g.lastPlayed > Date.now() - 30 * DAY).sort((a, b) => b.lastPlayed - a.lastPlayed);
function featured() {
  const f = byId(S.settings.featuredId);
  return (f && visible(f) ? f : null) || [...S.games].filter(visible).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0] || null;
}
/** The seven games on the rack: most played first, topped up by recently played. */
function rackGames() {
  const top = mostPlayed().slice(0, 7);
  if (top.length < 7) {
    const more = S.games.filter((g) => visible(g) && !top.includes(g)).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || b.added - a.added);
    top.push(...more.slice(0, 7 - top.length));
  }
  return top;
}

const SORTS = {
  lastPlayed: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  total: (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  added: (a, b) => b.added - a.added,
  year: (a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name),
};
const sortGames = (list, how) => [...list].sort(SORTS[how] || SORTS.name);

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'warn' ? 6500 : 3800);
}
async function call(p, okText) {
  const r = await p;
  if (r && r.error) { toast(r.error, 'warn'); return null; }
  if (okText) toast(okText);
  return r;
}

/* ---------- modal: confirmations and short questions ---------- */

function ask({ title, text = '', input = null, confirm = 'OK', danger = false }) {
  return new Promise((resolve) => {
    ui.modal = { title, text, input, confirm, danger, resolve };
    renderModal();
  });
}
function renderModal() {
  const m = ui.modal, root = $('#modal');
  if (!m) { root.innerHTML = ''; root.hidden = true; return; }
  root.hidden = false;
  root.innerHTML = `<div class="modal" data-act="modalCancel"><div class="box" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <h2 id="m-title" class="title">${esc(m.title)}</h2>${m.text ? `<p>${esc(m.text)}</p>` : ''}
    ${m.input ? `<div class="input"><input id="m-input" value="${esc(m.input.value || '')}" placeholder="${esc(m.input.placeholder || '')}" maxlength="60"></div>` : ''}
    <div class="row2"><button class="btn ghost" data-act="modalCancel">Cancel</button><button class="btn ${m.danger ? 'warn' : 'solid'}" data-act="modalOk">${esc(m.confirm)}</button></div></div></div>`;
  const inp = $('#m-input');
  (inp || $('.modal [data-act="modalOk"]')).focus();
  if (inp) { inp.select(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') closeModal(true); }); }
}
function closeModal(ok) {
  const m = ui.modal;
  if (!m) return;
  const value = ok ? (m.input ? ($('#m-input').value || '').trim() : true) : null;
  ui.modal = null;
  renderModal();
  m.resolve(ok && (!m.input || value) ? value : null);
}

/* ---------- rail ---------- */

function renderRail() {
  const count = (f) => S.games.filter(f).length;
  const nav = (view, arg, icon, label, n, on, extra = '') => `<button class="${on ? 'on' : ''}" data-act="go" data-view="${view}" data-arg="${esc(arg ?? '')}" ${extra}>${ic(icon)}<span>${esc(label)}</span>${n != null ? `<b class="num">${n}</b>` : ''}</button>`;
  const at = (v, a) => ui.view === v && (a == null || ui.arg === a);
  const sources = Object.keys(SRC).filter((s) => count((g) => visible(g) && g.source === s));
  const lists = LISTS.map(([k, label, icon, f]) => [k, label, icon, count((g) => (k === 'hidden' ? g.hidden : k === 'notinstalled' ? g.notInstalled && !g.hidden : visible(g)) && f(g))]).filter((l) => l[3] > 0);
  const found = (S.found || []).length;
  $('#rail').innerHTML = `
    <div class="nav">${nav('home', null, 'home', 'Home', null, at('home'))}${nav('games', 'all', 'grid', 'All games', count(visible), at('games', 'all'))}${nav('games', 'fav', 'star', 'Favourites', count((g) => visible(g) && g.favourite), at('games', 'fav'))}
      ${found ? `<button class="${at('found') ? 'on' : ''}" data-act="go" data-view="found">${ic('sparkle')}<span>New games found</span><span class="badge">${found}</span></button>` : ''}</div>
    ${lists.length ? `<div class="nav"><h3>Lists</h3>${lists.map(([k, label, icon, n]) => nav('games', `l:${k}`, icon, label, n, at('games', `l:${k}`))).join('')}</div>` : ''}
    <div class="nav"><h3>Collections</h3>
      ${S.collections.map((c) => nav('games', `c:${c.id}`, 'stack', c.name, count((g) => visible(g) && (g.collections || []).includes(c.id)), at('games', `c:${c.id}`), `data-col="${c.id}"`)).join('')}
      ${ui.newCollection ? '<input id="newcol" placeholder="Collection name" aria-label="New collection name" maxlength="60">' : `<button class="add" data-act="newCollection">${ic('plus')}<span>New collection</span></button>`}
    </div>
    ${sources.length ? `<div class="nav"><h3>Sources</h3>${sources.map((s) => nav('games', `s:${s}`, SRC_ICON[s], SRC[s], count((g) => visible(g) && g.source === s), at('games', `s:${s}`))).join('')}</div>` : ''}
    <div class="nav foot">${nav('scan', null, 'scan', 'Scan for games', null, at('scan'))}${nav('settings', null, 'gear', 'Settings', null, at('settings'))}</div>`;
  const nc = $('#newcol');
  if (nc) {
    nc.focus();
    nc.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') { ui.newCollection = false; renderRail(); }
      if (e.key === 'Enter' && nc.value.trim()) {
        const r = await call(R.createCollection(nc.value));
        ui.newCollection = false;
        if (r) go('games', `c:${r.id}`);
      }
    });
    nc.addEventListener('blur', () => { setTimeout(() => { if (ui.newCollection) { ui.newCollection = false; renderRail(); } }, 150); });
  }
}

function renderTitlebar() {
  const u = S.update || {};
  const chip = u.status === 'ready' ? `<button class="chip" data-act="installUpdate">${ic('down')}Restart to update to ${esc(u.version)}</button>`
    : u.status === 'available' ? `<button class="chip" data-act="openRelease">${ic('down')}Rack ${esc(u.version)} is out. Download</button>` : '';
  $('.titlebar').innerHTML = `<span class="wordmark">RACK</span>${chip}`;
}

/* ---------- the rack figure ---------- */

let FIG = null, rackEl = null, rackHandle = null, rackRest = -2, rackSlot = -1, rackList = [];
// The rack holds seven cartridges, back (0) to front (6). The most played game stands in front,
// where its whole cover shows, so list position k sits in cartridge 6 - k.
const RACK_N = 7;
const cartOf = (k) => (k >= 0 ? RACK_N - 1 - k : -1);
const rackCovers = () => { if (rackHandle && rackHandle.covers) rackHandle.covers(Array.from({ length: RACK_N }, (_, c) => coverUrl(rackList[cartOf(c)]))); };
window.hairline = (fig) => { FIG = fig; };
const figReady = import('./vendor/cartridges.js');

function rackStage(rest) {
  if (!FIG) return null;
  if (rackEl && rest === rackRest) return rackEl;
  if (rackHandle) rackHandle.destroy();
  rackEl = document.createElement('div');
  rackEl.id = 'rack';
  rackEl.dataset.hairline = FIG.name;
  rackEl.dataset.rest = String(rest);
  rackEl.setAttribute('role', 'img');
  rackEl.setAttribute('aria-label', 'Your most played games, as cartridges in a rack');
  HL.inject(document);
  const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, rackEl);
  const read = {
    _t: 'rest',
    get textContent() { return this._t; },
    set textContent(v) {
      this._t = v;
      const m = /slot (\d+)/.exec(v || '');
      rackSlot = m ? cartOf(Number(m[1]) - 1) : -1;
      const g = rackSlot >= 0 ? rackList[rackSlot] : null;
      ui.preview = g ? g.id : null;
      renderHeroInfo();
      document.querySelectorAll('.thumbs button').forEach((b, i) => b.classList.toggle('on', i === rackSlot));
    },
  };
  // lift far enough that a pulled cartridge shows most of its label
  rackHandle = FIG.mount({ stage: rackEl, svg, read }, 46);
  rackEl.addEventListener('click', () => { const g = rackList[rackSlot]; if (g) call(R.feature(g.id)); });
  rackEl.addEventListener('contextmenu', (e) => { const g = rackList[rackSlot]; if (g) { e.preventDefault(); e.stopPropagation(); R.menu([g.id]); } });
  rackRest = rest;
  return rackEl;
}

/* ---------- home ---------- */

function playButton(g, big = true) {
  const cls = big ? 'big' : '';
  if (g.missing) return `<button class="btn ${cls}" data-act="locate" data-id="${g.id}">Find the game</button>`;
  if (isRunning(g)) return `<button class="btn ${cls} running" data-act="stopTiming" data-id="${g.id}" title="Stop timing">${ic('stop')}Playing</button>`;
  if (g.notInstalled) return `<button class="btn solid ${cls}" data-act="play" data-id="${g.id}">${ic('down')}Install</button>`;
  const main = `<button class="btn solid ${cls}" data-act="play" data-id="${g.id}">${ic('play')}${isLaunching(g) ? 'Starting' : 'Play'}</button>`;
  return (g.actions || []).length ? `<span class="split">${main}<button class="btn solid ${cls}" data-act="actionsMenu" data-id="${g.id}" aria-label="Other ways to start" title="Other ways to start">${ic('down')}</button></span>` : main;
}

function heroInfoHTML(g) {
  const col = (g.collections || []).map((id) => S.collections.find((c) => c.id === id)).filter(Boolean)[0];
  const pinned = S.settings.featuredId === g.id;
  return `
    <h1 class="title ${g.name.length > 14 ? 'long' : ''}">${esc(g.name)}</h1>
    <dl class="facts">
      <div><dt>Last played</dt><dd>${esc(ago(g.lastPlayed))}</dd></div>
      <div><dt>Time played</dt><dd class="num">${esc(hoursLong(g.total))}</dd></div>
      <div><dt>From</dt><dd>${esc(g.source === 'emulator' ? `${g.platform || 'Emulator'} emulator` : SRC[g.source])}</dd></div>
      ${(g.genres || []).length ? `<div><dt>Genre</dt><dd>${esc(g.genres.slice(0, 2).join(', '))}</dd></div>` : ''}
      ${g.year ? `<div><dt>Released</dt><dd>${g.year}</dd></div>` : ''}
      ${g.status ? `<div><dt>Status</dt><dd>${esc(STATUS_LABEL[g.status])}</dd></div>` : col ? `<div><dt>Collection</dt><dd>${esc(col.name)}</dd></div>` : ''}
      ${g.missing ? '<div><dt>Files</dt><dd style="color:var(--signal)">Not found</dd></div>' : ''}
    </dl>
    <p class="blurb">${g.description ? esc(g.description) : '<span class="muted">No description yet. You can write one in Details.</span>'}</p>
    <div class="actions">${playButton(g)}<button class="btn big" data-act="open" data-id="${g.id}">Details</button>
      <button class="btn icon ${pinned ? 'on' : ''}" data-act="pin" data-id="${g.id}" aria-label="${pinned ? 'Stop featuring this game' : 'Feature this game'}" title="${pinned ? 'Featured. Click to go back to your last played game.' : 'Keep this game featured'}">${ic('star')}</button></div>`;
}

function renderHeroInfo() {
  const info = $('#hero-info'), cov = $('#hero-cover'), cap = $('#rack-name');
  if (!info) return;
  const g = (ui.preview && byId(ui.preview)) || featured();
  if (!g) return;
  info.innerHTML = heroInfoHTML(g);
  cov.innerHTML = coverHTML(g, { src: false });
  cov.dataset.gid = g.id;
  if (cap) cap.textContent = ui.preview ? `${g.name}, ${hours(g.total)}` : '';
}

function renderHome() {
  const f = featured();
  rackList = rackGames();
  const rest = f ? cartOf(rackList.indexOf(f)) : -1;
  const found = (S.found || []).length;
  const banner = found ? `<div class="banner">${ic('sparkle')}<span><b>${found} new ${found === 1 ? 'game' : 'games'} found.</b> ${esc(S.found.slice(0, 3).map((x) => x.name).join(', '))}${found > 3 ? '…' : ''}</span><span class="spacer"></span><button class="btn small solid" data-act="go" data-view="found">Review</button></div>` : '';
  if (!S.games.filter(visible).length) {
    return `${banner}<section class="hero welcome">
      <div><h1 class="title" style="font-size:56px;margin:0">Your rack is empty</h1>
        <p class="blurb">Rack finds games from Steam, Epic, GOG, Ubisoft, EA, Battle.net and Xbox on its own, and can look through any folder, drive or ROM collection.</p>
        <div class="actions"><button class="btn solid big" data-act="go" data-view="scan">${ic('scan')}Scan for games</button><button class="btn big" data-act="addManual">Add one game</button></div></div>
      <div class="rackwrap"><div id="rackslot" data-rest="2"></div></div></section>`;
  }
  const jb = jumpBackIn().slice(0, 12), mp = mostPlayed().slice(0, 12), ra = recentAdded().slice(0, 11);
  const max = mp.length ? mp[0].total : 1;
  const lastSession = (g) => { const s = (g.sessions || []).slice(-1)[0]; return s && s.minutes ? `${hours(s.minutes)}, ${ago(g.lastPlayed, true).toLowerCase()}` : ago(g.lastPlayed, true); };
  return `${banner}
  <section class="hero">
    <div id="hero-cover"></div>
    <div id="hero-info"></div>
    <div class="rackwrap"><div id="rackslot" data-rest="${rest}"></div>
      <div class="thumbs">${rackList.map((g, i) => `<button data-act="feature" data-id="${g.id}" data-gid="${g.id}" data-slot="${i}" title="${esc(g.name)}" aria-label="Feature ${esc(g.name)}">${coverHTML(g, { src: false, state: false })}</button>`).join('')}</div>
      <div class="rackcap"><span>Your most played. Point at one to preview it, click to feature it.</span><strong id="rack-name"></strong></div></div>
  </section>
  ${jb.length ? `<section class="shelf"><header><h2 class="title">Jump back in</h2><span>Played in the last 30 days</span><button class="link" data-act="go" data-view="games" data-arg="l:month">See all</button></header>
    <div class="row">${jb.map((g) => tile(g, `<small>${esc(lastSession(g))}</small>`)).join('')}</div></section>` : ''}
  <section class="shelf"><header><h2 class="title">Most played</h2><span>${S.settings.importSteamPlaytime ? 'Timed by Rack, plus hours from Steam' : 'Timed by Rack'}</span>${mp.length ? '<button class="link" data-act="go" data-view="games" data-arg="all" data-sort="total">See all</button>' : ''}</header>
    ${mp.length ? `<div class="row">${mp.map((g) => tile(g, `<div class="hours"><i style="width:${Math.max(3, Math.round((g.total / max) * 100))}%"></i></div><small class="num">${hours(g.total)}</small>`)).join('')}</div>`
      : '<p class="muted" style="margin:0 0 18px">Play something and it will show up here. Rack times games even when you start them from Steam or a shortcut.</p>'}
  </section>
  <section class="shelf"><header><h2 class="title">Recently added</h2><span>${S.games.filter(visible).length} in your library</span><button class="link" data-act="go" data-view="games" data-arg="all" data-sort="added">See all</button></header>
    <div class="row">${ra.map((g) => tile(g, `<small>${esc(ago(g.added, true))}</small>`)).join('')}
      <button class="tile addtile hit" data-act="go" data-view="scan"><div class="cover">${ic('plus')}Scan a folder or add a game</div></button></div>
  </section><div style="height:24px"></div>`;
}

function afterHome() {
  const slot = $('#rackslot');
  if (slot) {
    const el = rackStage(Number(slot.dataset.rest));
    if (el) slot.replaceWith(el);
  }
  rackCovers();
  renderHeroInfo();
}

/* ---------- grids ---------- */

function baseList() {
  const a = ui.arg || 'all';
  if (a === 'fav') return { list: S.games.filter((g) => visible(g) && g.favourite), title: 'Favourites' };
  if (a.startsWith('c:')) {
    const c = S.collections.find((x) => x.id === a.slice(2));
    if (!c) return null;
    return { list: S.games.filter((g) => visible(g) && (g.collections || []).includes(c.id)), title: c.name, col: c };
  }
  if (a.startsWith('s:')) { const s = a.slice(2); return { list: S.games.filter((g) => visible(g) && g.source === s), title: SRC[s] }; }
  if (a.startsWith('l:')) {
    const l = LISTS.find((x) => x[0] === a.slice(2));
    if (!l) return null;
    const pool = l[0] === 'hidden' ? S.games.filter((g) => g.hidden) : l[0] === 'notinstalled' ? S.games.filter((g) => g.notInstalled && !g.hidden) : S.games.filter(visible);
    return { list: pool.filter(l[3]), title: l[1], listKey: l[0] };
  }
  return { list: S.games.filter(visible), title: 'All games' };
}

function filtered(list) {
  const f = ui.f;
  return list.filter((g) => (!f.source || g.source === f.source) && (!f.status || (f.status === 'none' ? !g.status : g.status === f.status)) && (!f.genre || (g.genres || []).includes(f.genre)));
}

function renderGames() {
  const b = baseList();
  if (!b) { ui.arg = 'all'; return renderGames(); }
  const all = b.list;
  const sort = ui.sort || S.settings.sort || 'lastPlayed';
  const view = S.settings.view || 'covers';
  let list = sortGames(filtered(all), sort);
  if (view === 'list') {
    const k = ui.listSort.key, d = ui.listSort.dir;
    const val = { name: (g) => g.name.toLowerCase(), source: (g) => sourceLabel(g), status: (g) => STATUS_LABEL[g.status || ''], total: (g) => g.total, lastPlayed: (g) => g.lastPlayed || 0, added: (g) => g.added };
    list = [...list].sort((x, y) => { const a = val[k](x), c = val[k](y); return (a < c ? -1 : a > c ? 1 : 0) * d || x.name.localeCompare(y.name); });
  }
  const sources = [...new Set(all.map((g) => g.source))];
  const genres = [...new Set(all.flatMap((g) => g.genres || []))].sort();
  const extra = b.col ? `<button class="btn small ghost" data-act="renameCollection" data-id="${b.col.id}">Rename</button><button class="btn small ghost warn" data-act="deleteCollection" data-id="${b.col.id}">Delete collection</button>` : '';
  const empty = ui.arg === 'fav' ? ['No favourites yet', 'Right-click a game and choose Favourite, or turn it on in its details.']
    : b.col ? ['This collection is empty', 'Right-click a game and choose Add to collection.']
      : b.listKey === 'hidden' ? ['Nothing hidden', 'Hidden games stay in your library but out of sight.']
        : list.length !== all.length ? ['No games match these filters', 'Clear a filter to see more.'] : ['No games here', 'Scan for games to fill your library.'];
  const subOf = (g) => `<small class="num">${sort === 'added' ? `Added ${esc(ago(g.added, true))}` : sort === 'total' ? hours(g.total) : sort === 'year' ? (g.year || '') : g.status ? esc(STATUS_LABEL[g.status]) : esc(ago(g.lastPlayed, true))}</small>`;
  const th = (key, label) => `<th><button data-act="listSort" data-key="${key}" ${ui.listSort.key === key ? `aria-sort="${ui.listSort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${label}${ui.listSort.key === key ? (ui.listSort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const fsel = (key, label, opts) => `<select data-act="filter" data-key="${key}" aria-label="${label}"><option value="">${label}: all</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${ui.f[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="page">
    <div class="gridhead"><h1 class="title">${esc(b.title)}</h1><span class="num">${list.length}${list.length !== all.length ? ` of ${all.length}` : ''} ${all.length === 1 ? 'game' : 'games'}</span>${extra}</div>
    <div class="toolbar">
      ${sources.length > 1 ? fsel('source', 'Source', sources.map((s) => [s, SRC[s] || s])) : ''}
      ${b.listKey && ['playing', 'backlog', 'completed', 'dropped'].includes(b.listKey) ? '' : fsel('status', 'Status', [['none', 'No status'], ...STATUS.slice(1)])}
      ${genres.length ? fsel('genre', 'Genre', genres.map((x) => [x, x])) : ''}
      ${ui.f.source || ui.f.status || ui.f.genre ? '<button class="btn small ghost" data-act="clearFilters">Clear filters</button>' : ''}
      <span class="spacer"></span>
      ${view === 'covers' ? `<select data-act="sort" aria-label="Sort">${[['lastPlayed', 'Last played'], ['name', 'Name'], ['total', 'Time played'], ['added', 'Recently added'], ['year', 'Release year']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
        <div class="seg" role="group" aria-label="Cover size">${[['s', 'S'], ['m', 'M'], ['l', 'L']].map(([v, l]) => `<button aria-pressed="${(S.settings.coverSize || 'm') === v}" data-act="coverSize" data-v="${v}" title="${{ s: 'Small', m: 'Medium', l: 'Large' }[v]} covers">${l}</button>`).join('')}</div>` : ''}
      <div class="seg" role="group" aria-label="View"><button aria-pressed="${view === 'covers'}" data-act="view" data-v="covers" title="Covers">${ic('grid')}</button><button aria-pressed="${view === 'list'}" data-act="view" data-v="list" title="List">${ic('list')}</button></div>
    </div>
    ${!list.length ? `<div class="empty" style="padding-left:0"><h2 class="title">${empty[0]}</h2><p>${empty[1]}</p></div>`
      : view === 'list'
        ? `<table class="list"><thead><tr><th></th>${th('name', 'Name')}${th('source', 'Source')}${th('status', 'Status')}${th('total', 'Time played')}${th('lastPlayed', 'Last played')}${th('added', 'Added')}<th></th></tr></thead><tbody>
            ${list.map((g) => `<tr class="lrow${ui.sel.has(g.id) ? ' sel' : ''}" tabindex="0" data-gid="${g.id}" data-act="open" data-id="${g.id}" data-fk="r:${g.id}">
              <td class="thumb">${coverHTML(g, { src: false, state: false })}</td><td class="name" title="${esc(g.name)}">${esc(g.name)}${g.notInstalled ? ' <span class="tag">Not installed</span>' : g.missing ? ' <span class="tag warn">Missing</span>' : isRunning(g) ? ' <span class="tag acc">Playing</span>' : ''}</td>
              <td>${esc(sourceLabel(g))}</td><td>${g.status ? esc(STATUS_LABEL[g.status]) : ''}</td><td class="num">${g.total ? hours(g.total) : ''}</td><td>${g.lastPlayed ? esc(ago(g.lastPlayed, true)) : ''}</td><td>${esc(ago(g.added, true))}</td>
              <td>${g.missing ? '' : `<button class="btn small ghost rowplay" data-act="play" data-id="${g.id}" tabindex="-1">${ic(g.notInstalled ? 'down' : 'play')}${g.notInstalled ? 'Install' : 'Play'}</button>`}</td></tr>`).join('')}
          </tbody></table>`
        : `<div class="grid">${list.map((g) => tile(g, subOf(g))).join('')}</div>`}
    <p class="note" style="margin-top:22px">Arrow keys move between games, Enter plays, Space opens details. Ctrl or Shift + click selects several. Right-click for more.</p>
  </div>`;
}

function renderSearch() {
  const q = $('#search').value.trim().toLowerCase();
  const list = sortGames(S.games.filter((g) => !g.hidden && (g.name.toLowerCase().includes(q) || (g.platform || '').toLowerCase() === q || (g.genres || []).some((x) => x.toLowerCase() === q) || (g.developer || '').toLowerCase().includes(q))), 'name');
  return `<div class="page"><div class="gridhead"><h1 class="title">Results for “${esc($('#search').value.trim())}”</h1><span>${list.length} ${list.length === 1 ? 'game' : 'games'}</span></div>
    ${list.length ? `<div class="grid">${list.map((g) => tile(g, `<small>${esc(sourceLabel(g))}${g.year ? ` · ${g.year}` : ''}</small>`)).join('')}</div>`
      : '<div class="empty" style="padding-left:0"><h2 class="title">No games match</h2><p>Check the spelling, or scan for games if it isn’t in your library yet.</p></div>'}</div>`;
}

/* ---------- details ---------- */

const draftOf = (g) => ({ name: g.name, exe: g.exe, args: g.args, cwd: g.cwd, admin: !!g.admin, favourite: !!g.favourite, collections: [...(g.collections || [])], description: g.description || '' });
const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function weeks(g) {
  const out = new Array(12).fill(0), now = Date.now(), W = 7 * DAY;
  for (const s of g.sessions || []) { const i = 11 - Math.floor((now - s.start) / W); if (i >= 0 && i < 12) out[i] += s.minutes; }
  return out;
}
const bytes = (b) => (!b ? '0 KB' : b > 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function savesPanel(g) {
  if (!S.ludusavi.ready) {
    return `<div class="panel"><h2 class="title">Saves</h2><p>Back up this game’s saves with Ludusavi, a free tool that knows where thousands of games keep them. Useful for games without cloud saves.</p>
      <button class="btn" data-act="go" data-view="settings">${ic('save')}Set up save backups</button></div>`;
  }
  const st = ui.saves[g.id] || {};
  const busy = (S.ludusavi.busy || []).includes(g.id);
  const info = st.loading ? 'Looking for this game’s saves…'
    : st.error ? esc(st.error)
      : st.data ? (st.data.found ? `${st.data.files} save ${st.data.files === 1 ? 'file' : 'files'} (${bytes(st.data.bytes)}) on this PC. Last backup: ${st.data.last ? esc(ago(st.data.last)) : 'never'}.` : 'Ludusavi doesn’t know this game, so it can’t find its saves.')
        : '';
  const can = st.data && st.data.found;
  return `<div class="panel"><h2 class="title">Saves</h2><p>${info || 'Checked with Ludusavi.'} Backups go to ${esc(S.saveBackupDir)}.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" data-act="savesBackup" data-id="${g.id}" ${can && !busy ? '' : 'disabled'}>${ic('save')}${busy ? 'Working…' : 'Back up now'}</button>
      <button class="btn" data-act="savesRestore" data-id="${g.id}" ${can && st.data.last && !busy ? '' : 'disabled'}>${ic('redo')}Restore last backup</button>
      <button class="btn ghost" data-act="savesOpen">${ic('folder')}Open backups folder</button>
      <button class="btn ghost" data-act="savesCheck" data-id="${g.id}">Check again</button>
    </div></div>`;
}

function actionsEditor(g) {
  const na = ui.detail.newAction;
  const sugg = (g.otherExes || []).filter((p) => !(g.actions || []).some((a) => a.exe === p)).slice(0, 4);
  const base = (p) => p.split(/[\\/]/).pop();
  return `<div class="field" style="margin-top:12px"><span>Other ways to start</span>
    <div class="actionlist">${(g.actions || []).map((a) => `<div class="arow"><div><b>${esc(a.name)}</b><small title="${esc(a.exe)}">${esc(a.exe)}${a.args ? ` ${esc(a.args)}` : ''}</small></div>
      <button class="btn small" data-act="runAction" data-id="${g.id}" data-aid="${a.id}">${ic('play')}Start</button><button class="btn small ghost" data-act="delAction" data-id="${g.id}" data-aid="${a.id}" aria-label="Remove ${esc(a.name)}">${ic('x')}</button></div>`).join('')}</div>
    ${na ? `<div class="panel" style="padding:12px">
        <div class="grid2"><div class="field"><label for="na-name">Name</label><div class="input"><input id="na-name" data-na="name" value="${esc(na.name)}" placeholder="Settings tool" maxlength="40"></div></div>
        <div class="field"><label for="na-args">Options</label><div class="input"><input id="na-args" data-na="args" value="${esc(na.args)}" placeholder="Optional"></div></div></div>
        <div class="field"><span>Program</span><div class="input"><span class="static">${esc(na.exe || 'Not chosen')}</span><button class="btn small" data-act="naBrowse">Browse</button></div></div>
        <div style="display:flex;gap:10px"><button class="btn solid small" data-act="naSave" data-id="${g.id}" ${na.exe && na.name ? '' : 'disabled'}>Add</button><button class="btn ghost small" data-act="naCancel">Cancel</button></div></div>`
      : `<div class="chips"><button class="tag" data-act="naNew">${ic('plus')}Add a way to start</button>${sugg.map((p) => `<button class="tag" data-act="naSuggest" data-exe="${esc(p)}" title="${esc(p)}">${ic('plus')}${esc(base(p))}</button>`).join('')}</div>
         ${sugg.length ? '<span class="muted" style="font-size:12px">Other programs Rack found in this game’s folder.</span>' : ''}`}
  </div>`;
}

function renderDetail() {
  const g = byId(ui.arg);
  if (!g) { ui.view = 'home'; return renderHome(); }
  const d = ui.detail;
  if (d.id !== g.id) {
    Object.assign(d, { id: g.id, draft: draftOf(g), matches: null, matchError: null, confirmRemove: false, loading: false, uninstall: null, newAction: null });
    loadMatches(g);
    if (S.ludusavi.ready && !ui.saves[g.id] && !g.notInstalled) loadSaves(g.id);
  }
  const dr = d.draft, dirty = !sameDraft(dr, draftOf(g));
  const viaStore = !!g.uri && g.source !== 'folder', emu = g.source === 'emulator';
  const rf = emu ? S.romFolders.find((r) => r.id === g.romFolderId) : null;
  const w = weeks(g), wmax = Math.max(1, ...w);
  const outside = (g.sessions || []).filter((s) => s.outside).length;
  const matches = (d.matches || []).map((m, i) => `<button data-act="useMatch" data-i="${i}" aria-label="Use this cover"><div class="cover"><img src="${esc(m.thumb)}" alt="" loading="lazy"></div></button>`).join('');
  const field = (label, key, ph = '') => `<div class="field"><label for="f-${key}">${label}</label><div class="input"><input id="f-${key}" data-draft="${key}" value="${esc(dr[key])}" placeholder="${esc(ph)}"></div></div>`;
  const colChips = dr.collections.map((id) => S.collections.find((c) => c.id === id)).filter(Boolean)
    .map((c) => `<button class="tag" data-act="dropCol" data-id="${c.id}" aria-label="Remove from ${esc(c.name)}">${esc(c.name)} ×</button>`).join('');
  const free = S.collections.filter((c) => !dr.collections.includes(c.id));
  return `<div class="page">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap" data-gid="${g.id}">
      <button class="btn icon sm" data-act="back" aria-label="Back">${ic('back')}</button>
      <h1 class="title" style="margin:0;font-size:34px">${esc(g.name)}</h1><span class="tag">${esc(emu ? `${g.platform || 'Emulator'} game` : SRC[g.source])}</span>
      ${g.missing ? '<span class="tag warn">Files not found</span>' : g.notInstalled ? '<span class="tag">Not installed</span>' : ''}
      ${g.hidden ? '<span class="tag">Hidden</span>' : ''}
      <span class="spacer"></span>
      ${g.notInstalled ? '' : `<button class="btn icon sm" data-act="openFolder" data-id="${g.id}" title="Open game folder" aria-label="Open game folder">${ic('folder')}</button>
      <button class="btn icon sm" data-act="shortcut" data-id="${g.id}" title="Create desktop shortcut" aria-label="Create desktop shortcut" ${S.app.windows ? '' : 'disabled'}>${ic('link')}</button>`}
      ${playButton(g, false)}
    </div>
    ${(g.genres || []).length || g.year || g.developer ? `<p class="muted" style="margin:8px 0 0 52px">${esc([g.developer, g.year, (g.genres || []).join(', ')].filter(Boolean).join(' · '))}</p>` : ''}
    <div class="cols" style="grid-template-columns:minmax(0,1fr) minmax(360px,440px)">
      <div style="display:grid;gap:20px">
        <div class="panel"><h2 class="title">Cover</h2>
          <p>${S.settings.sgdbKey ? (d.loading ? `Looking for covers of “${esc(g.name)}” on SteamGridDB…` : d.matchError ? esc(d.matchError) : d.matches && d.matches.length ? `${d.matches.length} matches from SteamGridDB. Click one to use it.` : 'SteamGridDB found nothing under this name. Try renaming the game, or search Google.')
            : 'Add a free SteamGridDB key in Settings to see cover choices here.'}</p>
          <div class="picker"><div class="sel" style="position:relative">${coverHTML(g, { src: false, state: false })}<small>In use</small></div>${matches}</div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn" data-act="coverSearch" data-id="${g.id}">${ic('img')}Find a cover on Google</button>
            <button class="btn" data-act="coverFile" data-id="${g.id}">${ic('folder')}Use an image file</button>
            ${S.settings.sgdbKey ? `<button class="btn ghost" data-act="reloadMatches">${ic('redo')}Search again</button>` : '<button class="btn ghost" data-act="go" data-view="settings">Open Settings</button>'}
          </div>
          <p class="note">Google Images opens inside Rack. Point at a picture and press “Use this image”, or right-click it.</p>
        </div>
        <div class="panel"><h2 class="title">Time played</h2><p>${g.source === 'steam' && S.settings.importSteamPlaytime ? 'Uses Steam’s count when it is higher, which includes other PCs.' : 'Counted while Rack sees the game running, wherever you started it.'}${outside ? ` ${outside} of these sessions were started outside Rack.` : ''}</p>
          <div class="stats"><div><b class="num">${g.total ? esc(hours(g.total)) : '0 h'}</b><span>Total</span></div><div><b class="num">${(g.sessions || []).length}</b><span>${(g.sessions || []).length === 1 ? 'Session' : 'Sessions'}</span></div><div><b>${esc(ago(g.lastPlayed, true))}</b><span>Last played</span></div></div>
          <div class="weeks" aria-label="Minutes played per week, last 12 weeks">${w.map((m, i) => `<i class="${i === 11 ? 'cur' : ''}" style="height:${Math.round((m / wmax) * 100)}%" title="${hours(m)}"></i>`).join('')}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--faint);margin-top:6px"><span>12 weeks ago</span><span>This week</span></div>
        </div>
        ${g.notInstalled ? '' : savesPanel(g)}
      </div>
      <div class="panel"><h2 class="title">Game settings</h2><p>${esc(g.notInstalled ? 'In your Steam library, not installed on this PC.' : g.source === 'folder' ? `Found in ${g.installDir}` : viaStore ? `Installed in ${g.installDir}` : emu ? `ROM file: ${g.rom}` : `Added ${ago(g.added, true).toLowerCase()}`)}</p>
        <div class="field"><span>Status</span><div><div class="seg" role="group" aria-label="Status">${STATUS.map(([v, l]) => `<button aria-pressed="${(g.status || '') === v}" data-act="setStatus" data-id="${g.id}" data-v="${v}">${l === 'No status' ? 'None' : l}</button>`).join('')}</div></div></div>
        ${field('Name', 'name')}
        ${viaStore ? `<div class="field"><span>Launch</span><div class="input"><span class="static">Starts through ${esc(SRC[g.source])}. Change launch options there.</span></div></div>`
          : emu ? `<div class="field"><span>Emulator</span><div class="input"><span class="static">${esc(rf ? rf.emulator : 'Not set')}</span></div></div>`
            : `<div class="field"><label for="f-exe">Launch file</label><div class="input"><input id="f-exe" data-draft="exe" value="${esc(dr.exe)}"><button class="btn small" data-act="browseExe">Browse</button></div></div>
               ${field('Launch options', 'args', 'For example -windowed')}${field('Start in', 'cwd', 'Same folder as the launch file')}
               <div class="srow" style="border-top:0;padding-top:0"><b>Run as administrator</b><button class="toggle" role="switch" aria-checked="${dr.admin}" data-act="draftToggle" data-key="admin" aria-label="Run as administrator"></button><small>Only if the game won’t start without it</small></div>`}
        ${g.notInstalled ? '' : actionsEditor(g)}
        <div class="srow"><b>Favourite</b><button class="toggle" role="switch" aria-checked="${dr.favourite}" data-act="draftToggle" data-key="favourite" aria-label="Favourite"></button><small>Shows in Favourites</small></div>
        <div class="srow"><b>Hide this game</b><button class="toggle" role="switch" aria-checked="${!!g.hidden}" data-act="toggleHidden" data-id="${g.id}" aria-label="Hide this game"></button><small>Keeps it in your library, out of sight</small></div>
        <div class="field" style="margin-top:12px"><span>Collections</span><div class="chips">${colChips}
          ${free.length ? `<select data-act="addCol" aria-label="Add to a collection"><option value="">Add to…</option>${free.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>` : S.collections.length ? '' : '<span class="muted" style="font-size:12px">Make a collection with “New collection” on the left.</span>'}</div></div>
        <div class="field"><label for="f-description">Description</label><textarea class="input" id="f-description" data-draft="description" placeholder="What is this game, and where did you leave off?">${esc(dr.description)}</textarea>
          ${g.descriptionFrom === 'steam' && dr.description === g.description ? '<span class="muted" style="font-size:12px">From the Steam store</span>' : ''}</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:18px"><button class="btn solid" data-act="save" ${dirty ? '' : 'disabled'}>Save changes</button><button class="btn ghost" data-act="discard" ${dirty ? '' : 'disabled'}>Cancel</button></div>
        <div class="danger">
          ${isUninstalling(g)
            ? `<div class="confirm"><span>Waiting for the uninstall to finish. Rack removes the game when its files are gone.</span><span class="spacer"></span><button class="btn small ghost" data-act="uninstallCancel" data-id="${g.id}">Stop waiting</button></div>`
            : d.uninstall
            ? (d.uninstall.loading ? '<div class="confirm"><span>Checking how to uninstall it…</span></div>'
              : `<div class="confirm col"><b>${esc(d.uninstall.title)}</b><span>${esc(d.uninstall.detail)}</span>${d.uninstall.warning ? `<span class="warntext">${esc(d.uninstall.warning)}</span>` : ''}
                  <div class="row2"><span class="spacer"></span><button class="btn small ghost" data-act="uninstallClose">Keep it</button>${d.uninstall.method === 'none' ? '' : `<button class="btn small warn" data-act="uninstall" data-id="${g.id}">${d.uninstall.method === 'trash' || d.uninstall.method === 'rom' ? 'Move to Recycle Bin' : d.uninstall.method === 'epic' ? 'Open Epic Games' : 'Uninstall'}</button>`}</div></div>`)
            : d.confirmRemove
            ? `<div class="confirm"><span>Remove ${esc(g.name)} from Rack? The game stays on your PC.</span><span class="spacer"></span><button class="btn small ghost" data-act="cancelRemove">Keep it</button><button class="btn small warn" data-act="remove" data-id="${g.id}">Remove</button></div>`
            : `<div class="row2">${g.notInstalled ? '' : `<button class="btn ghost warn" data-act="askUninstall" data-id="${g.id}" ${g.missing ? 'disabled' : ''}>Uninstall game</button>`}<button class="btn ghost" data-act="askRemove">Remove from library</button></div>
               <p class="note">Uninstall deletes the game from your PC. Remove from library only takes it out of Rack.</p>`}
        </div>
      </div>
    </div></div>`;
}

async function loadMatches(g) {
  const d = ui.detail;
  if (!S.settings.sgdbKey) return;
  d.loading = true; d.matchError = null;
  const r = await R.coverMatches(g.id);
  if (d.id !== g.id) return;
  d.loading = false;
  if (r && r.error) d.matchError = r.error; else d.matches = r || [];
  if (ui.view === 'detail') render();
}
async function loadSaves(id) {
  ui.saves[id] = { loading: true };
  if (ui.view === 'detail') render();
  const r = await R.savesPreview(id);
  ui.saves[id] = r && r.error ? { error: r.error } : { data: r };
  if (ui.view === 'detail' && ui.arg === id) render();
}

/* ---------- scan ---------- */

const STORE_ORDER = ['steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'xbox'];
function renderScan() {
  const sc = ui.scan, st = sc.stores;
  const row = (key) => {
    const s = st && st[key];
    const label = SRC[key] === 'Xbox' ? 'Xbox app' : SRC[key];
    const sub = !st ? 'Checking…' : s.off ? 'Turned off in Settings' : !s.installed ? 'Not found on this PC' : `${s.total} installed${s.fresh < s.total ? `, ${s.fresh} new` : ''}${key === 'steam' && S.settings.importSteamPlaytime ? '. Hours played come along.' : ''}`;
    const on = !!(s && s.installed && s.fresh && sc.storesOn[key] !== false);
    return `<div class="srow"><b>${label}</b><button class="toggle" role="switch" aria-label="Include ${label}" aria-checked="${on}" ${s && s.installed && s.fresh ? '' : 'disabled'} data-act="storeToggle" data-key="${key}"></button><small>${sub}</small></div>`;
  };
  const all = Object.entries(sc.results).flatMap(([fid, list]) => list.map((c) => ({ ...c, fid })));
  const shown = all.filter((c) => sc.showSkipped || c.status !== 'skipped');
  const skipped = all.filter((c) => c.status === 'skipped').length;
  const total = scanTotal();
  const f = sc.romForm;
  return `<div class="page" style="padding-bottom:24px">
    <h1 class="title" style="margin:0;font-size:34px">Scan for games</h1>
    <p style="margin:6px 0 0;color:var(--soft);max-width:72ch">Rack reads the game lists your stores keep, then looks through the folders and drives you choose. It also checks for new games on its own while it runs.</p>
    <div class="cols" style="grid-template-columns:minmax(300px,380px) minmax(0,1fr)">
      <div style="display:grid;gap:20px">
        <div class="panel"><h2 class="title">Game stores</h2><p>Found from each store’s own records.</p>
          ${STORE_ORDER.map(row).join('')}
          <div style="margin-top:10px"><button class="btn small ghost" data-act="rescanStores">${ic('redo')}Check stores again</button></div></div>
        <div class="panel"><h2 class="title">Emulators</h2><p>Point a ROM folder at the emulator that opens it.</p>
          ${S.romFolders.map((r) => `<div class="srow"><b>${esc(r.path)}</b><button class="btn small ghost" data-act="romRemove" data-id="${r.id}">Remove</button><small>${esc(r.label)}: ${r.count ?? '?'} games. Opens with ${esc(r.emulator.split(/[\\/]/).pop())}</small></div>`).join('')}
          ${f ? `<div style="margin-top:8px">
            <div class="field"><span>ROM folder</span><div class="input"><span class="static">${esc(f.path || 'Not chosen')}</span><button class="btn small" data-act="romPick" data-key="path">Browse</button></div></div>
            <div class="field"><span>Emulator program</span><div class="input"><span class="static">${esc(f.emulator || 'Not chosen')}</span><button class="btn small" data-act="romPick" data-key="emulator">Browse</button></div></div>
            <div class="field"><label for="r-exts">File types</label><div class="input"><input id="r-exts" data-rom="exts" value="${esc(f.exts)}" placeholder=".sfc, .smc"></div></div>
            <div class="field"><label for="r-label">Label</label><div class="input"><input id="r-label" data-rom="label" value="${esc(f.label)}" placeholder="SNES" maxlength="12"></div></div>
            <div class="field"><label for="r-args">Launch options</label><div class="input"><input id="r-args" data-rom="args" value="${esc(f.args)}"></div><span class="muted" style="font-size:12px">{rom} is replaced by the game file. Most emulators need only "{rom}".</span></div>
            <div style="display:flex;gap:10px"><button class="btn solid" data-act="romSave">Save ROM folder</button><button class="btn ghost" data-act="romCancel">Cancel</button></div></div>`
            : `<div style="margin-top:8px"><button class="btn" data-act="romNew">${ic('plus')}Add ROM folder</button></div>`}
        </div>
      </div>
      <div class="panel">
        <h2 class="title">Folders and drives</h2><p>Add a folder or a whole drive. Rack looks inside each game folder for store files, game engines and what each program says about itself, and skips installers, tools and ordinary apps.</p>
        ${S.folders.map((fo) => {
          const pr = sc.progress[fo.id], res = sc.results[fo.id];
          const running = pr && !pr.done;
          const status = running ? progressText(pr)
            : res ? `Done. ${res.filter((c) => c.status === 'likely').length} games found${res.filter((c) => c.status === 'unsure').length ? `, ${res.filter((c) => c.status === 'unsure').length} maybe` : ''}${pr && pr.stopped ? ' (stopped early)' : ''}`
              : fo.lastScan ? `Last checked ${ago(fo.lastScan, true).toLowerCase()}` : 'Not scanned yet';
          return `<div class="folder" data-folder="${fo.id}">${ic('folder')}<b title="${esc(fo.path)}"><bdi>${esc(fo.path)}</bdi></b><span class="muted">${esc(status)}</span><span class="spacer"></span>${running ? `<span class="bar"><i></i></span><button class="btn small ghost" data-act="stopScan" data-id="${fo.id}">Stop</button>` : `<button class="btn small ghost" data-act="rescan" data-id="${fo.id}">Rescan</button><button class="btn small ghost" data-act="folderRemove" data-id="${fo.id}">Remove</button>`}</div>`;
        }).join('')}
        <button class="btn" style="margin:4px 0 18px" data-act="folderAdd">${ic('plus')}Add folder or drive</button>
        ${sc.error ? `<p class="note" style="color:var(--signal)">${esc(sc.error)}</p>` : ''}
        ${all.length ? `<div class="tablewrap" id="scan-table"><table>
          <thead><tr><th style="width:34px"></th><th>Game</th><th>Launch file</th><th>How Rack knows</th></tr></thead>
          <tbody>${shown.map(candRow).join('')}</tbody></table></div>
          <p class="muted" style="margin:12px 4px 0;font-size:13px">Showing ${shown.length} of ${all.length}. ${skipped ? `<button class="link" data-act="toggleSkipped">${sc.showSkipped ? 'Hide' : 'Show'} ${skipped} that don’t look like games</button>` : ''}</p>`
          : S.folders.length ? '' : '<p class="muted" style="margin:0">Add the folders or drives where you keep games, for example D:\\\\ or D:\\\\Games.</p>'}
      </div>
    </div></div>
    <div class="footerbar">${footerHTML(total)}</div>`;
}
function footerHTML(total) {
  return `<span class="muted">${total ? `${total} new ${total === 1 ? 'game' : 'games'} selected.` : 'Nothing new selected.'} Covers come from Steam and SteamGridDB after you add them.</span><span class="spacer"></span>
      <button class="btn ghost" data-act="go" data-view="home">Cancel</button><button class="btn solid" style="height:42px;padding:0 20px" data-act="addScanned" ${total ? '' : 'disabled'}>Add ${total || ''} ${total === 1 ? 'game' : 'games'}</button>`;
}
function scanTotal() {
  const sc = ui.scan, st = sc.stores;
  const newStore = st ? STORE_ORDER.reduce((n, k) => n + (st[k] && st[k].installed && sc.storesOn[k] !== false ? st[k].fresh : 0), 0) : 0;
  const romNew = S.romFolders.reduce((n, rf) => n + Math.max(0, (rf.count || 0) - S.games.filter((g) => g.romFolderId === rf.id).length), 0);
  return newStore + sc.checked.size + romNew;
}
function candRow(c) {
  const sc = ui.scan;
  const can = c.status !== 'have';
  const on = sc.checked.has(c.id);
  const choice = sc.exeChoice[c.id] || c.exe;
  const launch = c.uri && c.source !== 'folder'
    ? `<span class="muted">Starts through ${esc(SRC[c.source] || c.source)}</span>`
    : c.exes.length > 1
      ? `<select class="exesel" data-act="exeChoice" data-id="${esc(c.id)}" aria-label="Launch file for ${esc(c.name)}">${c.exes.map((e) => `<option value="${esc(e.path)}" ${e.path === choice ? 'selected' : ''}>${esc(e.rel)}</option>`).join('')}</select>`
      : `<bdi>${esc(c.exes[0] ? c.exes[0].rel : c.exe)}</bdi>`;
  const tag = c.status === 'likely' ? `<span class="tag">${esc(c.reason)}</span>` : c.status === 'unsure' ? `<span class="tag warn">${esc(c.reason)}</span>` : `<span class="muted">${esc(c.reason)}</span>`;
  return `<tr class="${c.status === 'skipped' || c.status === 'have' ? 'dim' : ''}" data-cand="${esc(c.id)}">
    <td>${can ? `<button class="check" role="checkbox" aria-checked="${on}" aria-label="Add ${esc(c.name)}" data-act="check" data-id="${esc(c.id)}">${on ? ic('check') : ''}</button>` : ''}</td>
    <td><span class="cname">${esc(c.name)}</span>${SRC_SHORT[c.source] && c.source !== 'folder' ? ` <span class="tag">${SRC_SHORT[c.source]}</span>` : ''}<small class="cdir" title="${esc(c.installDir)}"><bdi>${esc(c.installDir)}</bdi></small></td>
    <td class="path">${launch}</td>
    <td>${tag}</td></tr>`;
}
function progressText(p) {
  if (p.phase === 'read') return p.total ? `Checking possible games, ${p.done || 0} of ${p.total}` : 'Checking possible games…';
  return `Looking through folders, ${(p.dirs || 0).toLocaleString()} so far`;
}
async function scanStores() {
  ui.scan.stores = null;
  if (ui.view === 'scan') render();
  const r = await call(R.scanStores());
  ui.scan.stores = r || Object.fromEntries(STORE_ORDER.map((k) => [k, { installed: false, total: 0, fresh: 0 }]));
  if (ui.view === 'scan') render();
}
async function scanFolder(id) {
  const sc = ui.scan;
  for (const c of sc.results[id] || []) { sc.checked.delete(c.id); delete sc.exeChoice[c.id]; }
  delete sc.results[id];
  sc.progress[id] = { phase: 'walk', dirs: 0 };
  sc.error = null;
  render();
  const r = await R.scanFolder(id);
  sc.progress[id] = { done: true, stopped: !!(r && r.stopped) };
  if (r && r.error) sc.error = r.error;
  else {
    sc.results[id] = r.candidates;
    for (const c of r.candidates) if (c.status === 'likely') sc.checked.add(c.id);
  }
  render();
}

/* ---------- games found in the background ---------- */

function renderFound() {
  const list = S.found || [];
  if (!ui.found.checked) ui.found.checked = new Set(list.map((f) => f.key));
  const ck = ui.found.checked;
  for (const k of [...ck]) if (!list.some((f) => f.key === k)) ck.delete(k);
  const n = list.filter((f) => ck.has(f.key)).length;
  return `<div class="page">
    <div class="gridhead"><h1 class="title">New games found</h1><span>${list.length} found while Rack was running</span></div>
    ${list.length ? `<div class="tablewrap" id="found-table" style="max-height:none"><table>
      <thead><tr><th style="width:34px"></th><th>Game</th><th>Where</th><th>How Rack knows</th><th>Found</th></tr></thead>
      <tbody>${list.map((f) => `<tr><td><button class="check" role="checkbox" aria-checked="${ck.has(f.key)}" aria-label="Add ${esc(f.name)}" data-act="foundCheck" data-key="${esc(f.key)}">${ck.has(f.key) ? ic('check') : ''}</button></td>
        <td><span class="cname">${esc(f.name)}</span>${SRC_SHORT[f.source] && f.source !== 'folder' ? ` <span class="tag">${SRC_SHORT[f.source]}</span>` : ''}</td>
        <td class="path" title="${esc(f.installDir || f.exe)}"><bdi>${esc(f.installDir || f.exe || '')}</bdi></td><td><span class="tag">${esc(f.reason || 'Game')}</span></td><td>${esc(ago(f.foundAt, true))}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn solid" data-act="foundAdd" ${n ? '' : 'disabled'}>Add ${n || ''} ${n === 1 ? 'game' : 'games'}</button>
        <button class="btn" data-act="foundIgnore" ${n ? '' : 'disabled'}>Not games, ignore ${n || ''}</button><span class="spacer"></span><button class="btn ghost" data-act="foundRecheck">${ic('redo')}Check again now</button></div>
      <p class="note">Ignored games won’t be suggested again. Scanning their folder again brings them back.</p>`
      : `<div class="empty" style="padding-left:0"><h2 class="title">Nothing new</h2><p>Rack checks your stores and folders while it runs and lists new games here.</p><button class="btn" data-act="foundRecheck">${ic('redo')}Check now</button></div>`}
  </div>`;
}

/* ---------- first run ---------- */

function renderSetup() {
  const st = ui.setup;
  if (st.state === 'idle') { st.state = 'scanning'; runSetupScan(); }
  const res = st.res;
  const total = res ? STORE_ORDER.reduce((n, k) => n + (res[k] && res[k].installed && st.on[k] !== false ? res[k].fresh : 0), 0) : 0;
  return `<div class="setup">
    <h1 class="title">Let’s find your games</h1>
    <p class="lede">${st.state === 'scanning' ? 'Looking in Steam, Epic, GOG, Ubisoft Connect, EA app, Battle.net and Xbox…' : total ? `Found ${total} ${total === 1 ? 'game' : 'games'} in your stores. Untick a store to leave it out.` : 'No store games found on this PC. Scan a folder or drive where you keep games.'}</p>
    ${res ? `<div class="storegrid">${STORE_ORDER.map((k) => { const s = res[k]; const on = s.installed && s.fresh && st.on[k] !== false; return `<div class="storecard ${s.installed && s.fresh ? '' : 'off'}">
        <div style="display:flex;align-items:center;gap:10px"><b>${esc(SRC[k] === 'Xbox' ? 'Xbox app' : SRC[k])}</b><span class="spacer"></span>${s.installed && s.fresh ? `<button class="toggle" role="switch" aria-label="Include ${esc(SRC[k])}" aria-checked="${on}" data-act="setupToggle" data-key="${k}"></button>` : ''}</div>
        <span class="num">${!s.installed ? 'Not on this PC' : `${s.fresh} ${s.fresh === 1 ? 'game' : 'games'}`}</span><small>${esc((s.names || []).slice(0, 6).join(', '))}${(s.names || []).length > 6 ? '…' : ''}</small></div>`; }).join('')}</div>` : '<div class="bar" style="width:240px;margin:10px 0 30px"><i></i></div>'}
    <div class="actions">
      <button class="btn solid big" data-act="setupAdd" ${total ? '' : 'disabled'}>${ic('plus')}Add ${total || ''} ${total === 1 ? 'game' : 'games'}</button>
      <button class="btn big" data-act="setupFolder">${ic('folder')}Scan a folder or drive</button>
      <button class="btn ghost big" data-act="setupSkip">Skip for now</button>
    </div>
    <p class="note" style="margin-top:24px">Rack stays in the tray to time your games, even ones you start from Steam or a shortcut. You can change this in Settings.</p>
  </div>`;
}
async function runSetupScan() {
  const r = await R.scanStores();
  ui.setup.res = r && !r.error ? r : Object.fromEntries(STORE_ORDER.map((k) => [k, { installed: false, total: 0, fresh: 0, names: [] }]));
  ui.setup.state = 'done';
  if (ui.view === 'setup') render();
}

/* ---------- settings ---------- */

function renderSettings() {
  const s = S.settings;
  const tog = (key, label, sub, disabled = false) => `<div class="srow"><b>${label}</b><button class="toggle" role="switch" aria-label="${label}" aria-checked="${!!s[key]}" data-act="setToggle" data-key="${key}" ${disabled ? 'disabled' : ''}></button><small>${sub}</small></div>`;
  const u = S.update || {};
  const updText = !S.app.packaged ? 'Updates work in the installed app.' : u.status === 'checking' ? 'Checking for updates…' : u.status === 'downloading' ? `Downloading ${u.version || 'the update'}… ${u.progress || 0}%`
    : u.status === 'ready' ? `Rack ${u.version} is ready. Restart Rack to finish.` : u.status === 'available' ? `Rack ${u.version} is out.` : u.status === 'current' ? 'Rack is up to date.' : u.status === 'error' ? `Couldn’t check for updates: ${u.error}` : 'Rack checks for updates on its own.';
  const swatch = (k) => `<button class="swatch" aria-pressed="${s.accent === k}" data-act="setAccent" data-v="${k}" title="${ACCENT_NAMES[k]}" aria-label="${ACCENT_NAMES[k]}" style="background:${k === 'mono' ? 'linear-gradient(135deg,#f2f2f3 50%,#1b1f27 50%)' : ACCENTS[k]}"></button>`;
  return `<div class="page" style="max-width:940px">
    <h1 class="title" style="margin:0;font-size:34px">Settings</h1>
    <div style="display:grid;gap:20px;margin-top:22px">
      <div class="panel"><h2 class="title">Appearance</h2><p>System follows the light or dark setting in Windows.</p>
        <div class="field"><span>Theme</span><div><div class="seg big" role="group" aria-label="Theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button aria-pressed="${s.theme === v}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></div></div>
        <div class="field"><span>Accent colour</span><div class="swatches">${Object.keys(ACCENTS).map(swatch).join('')}
          <label class="swatch custom" title="Your colour" aria-pressed="${s.accent === 'custom'}" style="${s.accent === 'custom' ? `background:${esc(s.accentCustom)}` : ''}"><input type="color" value="${esc(s.accentCustom || '#7c9cff')}" data-act="customAccent" aria-label="Pick your own accent colour"></label>
          <span class="muted" style="font-size:12px">${esc(ACCENT_NAMES[s.accent] || '')}</span></div></div>
        <div class="grid2">
          <div class="field"><span>Dark background</span><div class="shades">${DARK_SHADES.map(([k, l, c]) => `<button class="shade" aria-pressed="${s.darkShade === k}" data-act="setShade" data-key="darkShade" data-v="${k}"><i style="background:${c}"></i><span>${l}</span></button>`).join('')}</div></div>
          <div class="field"><span>Light background</span><div class="shades">${LIGHT_SHADES.map(([k, l, c]) => `<button class="shade" aria-pressed="${s.lightShade === k}" data-act="setShade" data-key="lightShade" data-v="${k}"><i style="background:${c}"></i><span>${l}</span></button>`).join('')}</div></div>
        </div>
        <div class="field"><span>Font</span><div class="fonts">${FONTS.map(([k, l, d]) => `<button class="fontopt" aria-pressed="${s.font === k}" data-act="setFont" data-v="${k}" data-font-preview="${k}"><b class="title">${l}</b><span>${d}</span></button>`).join('')}</div></div>
      </div>
      <div class="panel"><h2 class="title">Playing</h2>
        ${S.app.windows && !S.app.native ? `<p class="note warnnote">Rack couldn’t load its Windows helper${S.app.nativeError ? ` (${esc(S.app.nativeError)})` : ''}, so it uses PowerShell to start and time games. It still works, but noticing a game can take a few seconds longer.</p>` : ''}
        <div class="field"><span>When a game starts</span><div><div class="seg big" role="group" aria-label="When a game starts">${[['close', 'Close Rack’s window'], ['minimize', 'Minimise'], ['nothing', 'Do nothing']].map(([v, l]) => `<button aria-pressed="${s.whilePlaying === v}" data-act="whilePlaying" data-v="${v}">${l}</button>`).join('')}</div></div>
          <span class="muted" style="font-size:12px">Closing the window frees memory while you play. Rack keeps timing in the tray and comes back when you stop.</span></div>
        ${tog('trackOutside', 'Time games started outside Rack', 'From Steam, a desktop shortcut or the Start menu, while Rack runs in the tray')}
        ${tog('importSteamPlaytime', 'Use Steam’s hours for Steam games', 'Includes time played on other PCs')}</div>
      <div class="panel"><h2 class="title">Finding games</h2>
        ${tog('autoFind', 'Find new games on its own', 'Checks your stores and scan folders while Rack runs')}
        ${tog('autoAddStore', 'Add new store games without asking', 'Folder finds always wait for you in “New games found”')}
        <div class="field" style="margin-top:12px"><span>Stores to read</span><div class="chips">${STORE_ORDER.map((k) => `<button class="tag ${s.sources[k] !== false ? 'acc' : ''}" data-act="toggleSource" data-key="${k}" aria-pressed="${s.sources[k] !== false}">${s.sources[k] !== false ? ic('check') : ''}${esc(SRC[k] === 'Xbox' ? 'Xbox app' : SRC[k])}</button>`).join('')}</div></div>
        <button class="btn small ghost" data-act="foundRecheck">${ic('redo')}Check for new games now</button></div>
      <div class="panel"><h2 class="title">Steam library</h2><p>With a free Steam Web API key, Rack shows the Steam games you own but haven’t installed, with an Install button, and keeps hours from all your PCs.</p>
        <div class="field"><label for="steamkey">Steam Web API key</label><div class="input"><input id="steamkey" type="password" value="${esc(s.steamApiKey)}" placeholder="Paste your key" autocomplete="off" spellcheck="false"><button class="btn small" data-act="saveSteamKey">Save key</button></div>
          <span class="muted" style="font-size:12px">${s.steamId ? `Account: ${esc(s.steamId)}` : 'Rack finds your account from Steam on this PC.'}</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px"><button class="btn" data-act="getSteamKey">${ic('ext')}Get a free key</button>${s.steamApiKey ? `<button class="btn ghost" data-act="refreshOwned">${ic('redo')}Refresh now</button>` : ''}</div>
        ${tog('showNotInstalled', 'Show Steam games you own but haven’t installed', 'They appear under “Not installed”, not on Home', !s.steamApiKey)}
        <p class="note">Your key stays on this PC. For it to work, set “Game details” to Public in your Steam privacy settings.</p></div>
      <div class="panel"><h2 class="title">Save backups</h2><p>Rack uses Ludusavi, a free open-source tool, to find and back up game saves. ${S.ludusavi.ready ? 'It’s set up.' : 'It isn’t set up yet.'}</p>
        ${S.ludusavi.ready ? `<div class="field"><span>Ludusavi</span><div class="input"><span class="static">${esc(S.ludusavi.path)}</span><button class="btn small" data-act="ludusaviPick">Change</button></div></div>`
          : `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px"><button class="btn solid" data-act="ludusaviDownload">${ic('down')}Download Ludusavi from GitHub</button><button class="btn" data-act="ludusaviPick">I already have ludusavi.exe</button></div>`}
        <div class="field"><span>Backups go to</span><div class="input"><span class="static">${esc(S.saveBackupDir)}</span><button class="btn small" data-act="savesPickDir">Change</button><button class="btn small" data-act="savesOpen">Open</button></div></div>
        ${tog('backupAfterPlay', 'Back up saves after playing', 'Runs when a game closes', !S.ludusavi.ready)}</div>
      <div class="panel"><h2 class="title">Covers</h2><p>Steam games, and games that are on the Steam store, get Steam’s cover art with no setup. For others, Rack asks SteamGridDB, which needs a free API key.</p>
        <div class="field"><label for="sgdb">SteamGridDB API key</label><div class="input"><input id="sgdb" type="password" value="${esc(s.sgdbKey)}" placeholder="Paste your key" autocomplete="off" spellcheck="false"><button class="btn small" data-act="saveKey">Save key</button></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="getKey">${ic('ext')}Get a free key</button><button class="btn ghost" data-act="fillArt">Find missing covers now</button></div></div>
      <div class="panel"><h2 class="title">Tray and startup</h2>
        ${tog('keepInTray', 'Keep Rack running in the tray', 'Closing the window keeps Rack timing games. Quit from the tray icon.')}
        ${tog('startWithWindows', 'Start Rack when Windows starts', S.app.portable ? 'Starts quietly in the tray. Moving the portable file breaks this.' : 'Starts quietly in the tray')}</div>
      <div class="panel"><h2 class="title">Your data</h2><p>Your library, covers and times are stored in ${esc(S.app.dataDir)}${S.app.portable ? ', next to the portable app, so they move with it' : ''}.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="exportLibrary">${ic('save')}Back up library to a file</button><button class="btn" data-act="importLibrary">${ic('redo')}Restore from a file</button><button class="btn ghost" data-act="openData">${ic('folder')}Open data folder</button></div></div>
      <div class="panel"><h2 class="title">Updates</h2><p>${esc(updText)}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${u.status === 'ready' ? '<button class="btn solid" data-act="installUpdate">Restart to update</button>' : u.status === 'available' ? '<button class="btn solid" data-act="openRelease">Download</button>' : `<button class="btn" data-act="checkUpdates" ${S.app.packaged ? '' : 'disabled'}>${ic('redo')}Check for updates</button>`}</div></div>
      <p class="muted" style="margin:4px 2px;font-size:12px">Rack ${esc(S.app.version)}${S.app.portable ? ' (portable)' : ''}. The rack drawing uses the Hairline engine (MIT). Save backups by Ludusavi (MIT). Fonts: Archivo, Geist, Chakra Petch, Exo 2 (SIL Open Font License).</p>
    </div></div>`;
}

/* ---------- bottom dock: selection and now playing ---------- */

function renderDock() {
  const dock = $('#dock');
  const sel = [...ui.sel].filter((id) => byId(id));
  const run = S.running || [];
  const launching = S.launching.filter((id) => !runningIds().includes(id));
  let html = '';
  if (sel.length) {
    html += `<div class="selbar"><b>${sel.length} selected</b>
      <button class="btn small" data-act="selFav">${ic('star')}Favourite</button>
      <select class="plain" data-act="selStatus" aria-label="Set status"><option value="">Set status…</option>${STATUS.map(([v, l]) => `<option value="${v || 'none'}">${l}</option>`).join('')}</select>
      <select class="plain" data-act="selCollection" aria-label="Add to collection"><option value="">Add to collection…</option>${S.collections.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="__new">New collection…</option></select>
      <button class="btn small" data-act="selHide">${ic('eye')}Hide</button>
      <button class="btn small warn" data-act="selRemove">Remove from library</button>
      <span class="spacer"></span><button class="btn small ghost" data-act="selClear">Clear selection</button></div>`;
  }
  for (const r of run) {
    const g = byId(r.id);
    if (!g) continue;
    html += `<div class="nowbar" data-gid="${g.id}"><span class="dot" aria-hidden="true"></span>${coverHTML(g, { src: false, state: false })}<span>Playing <strong>${esc(g.name)}</strong></span>
      <span class="muted num" data-since="${r.start}">${clock(Date.now() - r.start)}</span><span class="spacer"></span>
      <button class="btn small ghost" data-act="stopTiming" data-id="${g.id}" title="Use this if the game has closed but Rack still counts">${ic('stop')}Stop timing</button></div>`;
  }
  for (const id of launching) {
    const g = byId(id);
    if (g) html += `<div class="nowbar"><span class="bar" style="flex:0 0 60px"><i></i></span><span>Starting <strong>${esc(g.name)}</strong>…</span></div>`;
  }
  dock.innerHTML = html;
  document.body.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
}
setInterval(() => { for (const el of document.querySelectorAll('[data-since]')) el.textContent = clock(Date.now() - Number(el.dataset.since)); }, 20000);

/* ---------- render ---------- */

let pending = false;
const editing = () => { const a = document.activeElement; return a && a !== $('#search') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#view, #rail, #dock'); };

function render() {
  if (!S) return;
  applyAppearance();
  renderTitlebar();
  renderDock();
  if (editing()) { pending = true; return; }
  pending = false;
  renderRail();
  const view = $('#view');
  const same = view.dataset.view === ui.view + (ui.arg || '');
  const keepScroll = same ? view.scrollTop : 0;
  const inner = same ? [...view.querySelectorAll('[id].tablewrap, [id].keep-scroll')].map((el) => [el.id, el.scrollTop]) : [];
  const fkEl = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-fk]') : null;
  const focusKey = fkEl && fkEl.dataset.fk;
  if (rackEl && rackEl.parentNode) rackEl.remove();
  view.innerHTML = { home: renderHome, games: renderGames, detail: renderDetail, scan: renderScan, settings: renderSettings, search: renderSearch, found: renderFound, setup: renderSetup }[ui.view]();
  view.dataset.view = ui.view + (ui.arg || '');
  view.scrollTop = keepScroll;
  for (const [id, top] of inner) { const el = document.getElementById(id); if (el) el.scrollTop = top; }
  if (focusKey) { const el = view.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`); if (el) el.focus({ preventScroll: true }); }
  if (ui.view === 'home') afterHome();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !editing()) render(); }, 0));

function go(view, arg = null) {
  if (ui.view !== view || ui.arg !== arg) { ui.back = { view: ui.view, arg: ui.arg }; ui.f = { source: '', status: '', genre: '' }; }
  ui.view = view; ui.arg = arg; ui.preview = null;
  if (view !== 'games' && view !== 'search') ui.sel.clear();
  if (view !== 'search') $('#search').value = '';
  if (view === 'scan' && !ui.scan.stores) scanStores();
  if (view !== 'detail') ui.detail.id = null;
  if (view === 'found') ui.found.checked = null;
  render();
  $('#view').scrollTop = 0;
}

/* ---------- selection ---------- */

function visibleIds() { return [...document.querySelectorAll('#view [data-gid].tile, #view tr.lrow[data-gid]')].map((el) => el.dataset.gid); }
function selectClick(id, e) {
  const ids = visibleIds();
  if (e.shiftKey && ui.anchor && ids.includes(ui.anchor)) {
    const [a, b] = [ids.indexOf(ui.anchor), ids.indexOf(id)].sort((x, y) => x - y);
    if (!e.ctrlKey && !e.metaKey) ui.sel.clear();
    for (const x of ids.slice(a, b + 1)) ui.sel.add(x);
  } else {
    ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id);
    ui.anchor = id;
  }
  syncSelection();
}
function syncSelection() {
  for (const el of document.querySelectorAll('#view [data-gid].tile, #view tr.lrow[data-gid]')) el.classList.toggle('sel', ui.sel.has(el.dataset.gid));
  renderDock();
}

/* ---------- actions ---------- */

async function newCollectionFor(ids) {
  const name = await ask({ title: 'New collection', text: ids.length ? `Add ${ids.length === 1 ? (byId(ids[0]) || {}).name : `${ids.length} games`} to a new collection.` : '', input: { placeholder: 'Collection name' }, confirm: 'Create' });
  if (name) { const r = await call(R.createCollection(name, ids)); if (r) toast(`Made “${name}”`); }
}
async function removeIds(ids) {
  const one = ids.length === 1 ? byId(ids[0]) : null;
  const ok = await ask({ title: one ? `Remove ${one.name}?` : `Remove ${ids.length} games?`, text: 'They stay on your PC. Automatic finding won’t add them back; scanning their folder again will.', confirm: 'Remove from library', danger: true });
  if (!ok) return;
  await call(R.bulk(ids, { remove: true }), one ? `Removed ${one.name}` : `Removed ${ids.length} games`);
  for (const id of ids) ui.sel.delete(id);
  if (ui.view === 'detail' && ids.includes(ui.arg)) go('home');
}
async function uninstallAsk(id) {
  if (ui.view !== 'detail' || ui.arg !== id) go('detail', id);
  await ACT.askUninstall({ dataset: { id } });
  const el = $('.danger'); if (el) el.scrollIntoView({ block: 'center' });
}

const ACT = {
  go: (el) => { if (el.dataset.sort) ui.sort = el.dataset.sort; else if (el.dataset.view === 'games') ui.sort = null; go(el.dataset.view, el.dataset.arg || null); },
  back: () => { const b = ui.back || { view: 'home' }; go(b.view, b.arg); },
  open: (el) => go('detail', el.dataset.id),
  play: async (el) => { const g = byId(el.dataset.id); if (await call(R.play(el.dataset.id))) toast(g.notInstalled ? `Steam will install ${g.name}` : `Starting ${g.name}`); },
  actionsMenu: (el) => R.menu([el.dataset.id]),
  runAction: async (el) => { const g = byId(el.dataset.id); const a = (g.actions || []).find((x) => x.id === el.dataset.aid); if (await call(R.play(g.id, a.id))) toast(`Starting ${a.name}`); },
  stopTiming: (el) => call(R.stopTiming(el.dataset.id)),
  pin: (el) => call(R.feature(S.settings.featuredId === el.dataset.id ? null : el.dataset.id)),
  feature: (el) => call(R.feature(el.dataset.id)),
  locate: (el) => call(R.locate(el.dataset.id)),
  openFolder: (el) => call(R.openFolder(el.dataset.id)),
  shortcut: async (el) => { const g = byId(el.dataset.id); if (await call(R.shortcut(el.dataset.id))) toast(`Shortcut for ${g.name} is on your desktop`); },
  addManual: async () => { const r = await call(R.addManual()); if (r && r.id) { S = await R.state(); go('detail', r.id); } },
  newCollection: () => { ui.newCollection = true; renderRail(); },
  renameCollection: async (el) => {
    const c = S.collections.find((x) => x.id === el.dataset.id);
    const name = await ask({ title: 'Rename collection', input: { value: c.name }, confirm: 'Rename' });
    if (name) call(R.renameCollection(c.id, name));
  },
  deleteCollection: async (el) => {
    const c = S.collections.find((x) => x.id === el.dataset.id);
    if (!(await ask({ title: `Delete “${c.name}”?`, text: 'The games stay in your library.', confirm: 'Delete collection', danger: true }))) return;
    await call(R.deleteCollection(c.id), 'Collection deleted');
    if (ui.arg === `c:${c.id}`) go('games', 'all');
  },
  modalOk: () => closeModal(true),
  modalCancel: (el, e) => { if (e && e.target.closest('.box') && !e.target.closest('[data-act="modalCancel"].btn')) return; closeModal(false); },

  // grid tools
  view: (el) => call(R.setSettings({ view: el.dataset.v })),
  coverSize: (el) => call(R.setSettings({ coverSize: el.dataset.v })),
  clearFilters: () => { ui.f = { source: '', status: '', genre: '' }; render(); },
  listSort: (el) => { const k = el.dataset.key; ui.listSort = { key: k, dir: ui.listSort.key === k ? -ui.listSort.dir : (k === 'name' || k === 'source' || k === 'status' ? 1 : -1) }; render(); },
  selClear: () => { ui.sel.clear(); syncSelection(); },
  selFav: () => { const ids = [...ui.sel]; const all = ids.every((id) => (byId(id) || {}).favourite); call(R.bulk(ids, { favourite: !all })); },
  selHide: () => { call(R.bulk([...ui.sel], { hidden: true }), `Hid ${ui.sel.size} games`); ui.sel.clear(); },
  selRemove: () => removeIds([...ui.sel]),

  // details
  draftToggle: (el) => { ui.detail.draft[el.dataset.key] = !ui.detail.draft[el.dataset.key]; render(); },
  setStatus: (el) => call(R.update(el.dataset.id, { status: el.dataset.v })),
  toggleHidden: (el) => { const g = byId(el.dataset.id); call(R.update(g.id, { hidden: !g.hidden }), g.hidden ? `${g.name} is back in your library` : `${g.name} is hidden. Find it under Lists > Hidden.`); },
  dropCol: (el) => { ui.detail.draft.collections = ui.detail.draft.collections.filter((c) => c !== el.dataset.id); render(); },
  browseExe: async () => { const f = await R.pick('exe'); if (f && !f.error) { ui.detail.draft.exe = f; render(); } },
  save: async () => { const d = ui.detail; if (await call(R.update(d.id, d.draft), 'Changes saved')) { S = await R.state(); d.draft = draftOf(byId(d.id)); render(); } },
  discard: () => { ui.detail.draft = draftOf(byId(ui.detail.id)); render(); },
  askRemove: () => { ui.detail.confirmRemove = true; ui.detail.uninstall = null; render(); },
  askUninstall: async (el) => {
    const d = ui.detail;
    d.confirmRemove = false;
    d.uninstall = { loading: true };
    render();
    const p = await R.uninstallPlan(el.dataset.id);
    if (d.id !== el.dataset.id) return;
    if (p && p.error) { d.uninstall = null; toast(p.error, 'warn'); } else d.uninstall = p;
    render();
  },
  uninstallClose: () => { ui.detail.uninstall = null; render(); },
  uninstall: async (el) => {
    const id = el.dataset.id;
    el.disabled = true;
    const r = await call(R.uninstall(id));
    ui.detail.uninstall = null;
    if (!r) { render(); return; }
    toast(r.text);
    if (r.done) go('home'); else render();
  },
  uninstallCancel: (el) => call(R.uninstallCancel(el.dataset.id)),
  cancelRemove: () => { ui.detail.confirmRemove = false; render(); },
  remove: async (el) => { const g = byId(el.dataset.id); if (await call(R.remove(el.dataset.id), `Removed ${g.name}`)) go('home'); },
  useMatch: async (el) => { const m = ui.detail.matches[Number(el.dataset.i)]; toast('Downloading cover…'); await call(R.setCoverUrl(ui.detail.id, m.url), 'Cover updated'); },
  coverFile: (el) => call(R.setCoverFile(el.dataset.id)),
  coverSearch: (el) => call(R.coverSearch(el.dataset.id)),
  reloadMatches: () => { ui.detail.matches = null; loadMatches(byId(ui.detail.id)); render(); },
  naNew: () => { ui.detail.newAction = { name: '', exe: '', args: '' }; render(); },
  naSuggest: (el) => { const exe = el.dataset.exe; const base = exe.split(/[\\/]/).pop().replace(/\.exe$/i, ''); ui.detail.newAction = { name: base.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), exe, args: '' }; render(); },
  naBrowse: async () => { const f = await R.pick('exe'); if (f && !f.error) { const na = ui.detail.newAction; na.exe = f; if (!na.name) na.name = f.split(/[\\/]/).pop().replace(/\.exe$/i, ''); render(); } },
  naCancel: () => { ui.detail.newAction = null; render(); },
  naSave: async (el) => {
    const g = byId(el.dataset.id), na = ui.detail.newAction;
    if (await call(R.update(g.id, { actions: [...(g.actions || []), { name: na.name.trim(), exe: na.exe, args: na.args.trim() }] }), `Added “${na.name.trim()}”`)) { ui.detail.newAction = null; render(); }
  },
  delAction: (el) => { const g = byId(el.dataset.id); call(R.update(g.id, { actions: (g.actions || []).filter((a) => a.id !== el.dataset.aid) })); },
  savesCheck: (el) => loadSaves(el.dataset.id),
  savesBackup: async (el) => { if (await call(R.savesBackup(el.dataset.id))) loadSaves(el.dataset.id); },
  savesRestore: async (el) => {
    const g = byId(el.dataset.id);
    if (!(await ask({ title: `Restore saves for ${g.name}?`, text: 'This replaces the saves on this PC with your last backup. Back up first if you might want the current ones.', confirm: 'Restore saves', danger: true }))) return;
    if (await call(R.savesRestore(g.id))) loadSaves(g.id);
  },
  savesOpen: () => R.savesOpenFolder(),

  // scan
  storeToggle: (el) => { ui.scan.storesOn[el.dataset.key] = ui.scan.storesOn[el.dataset.key] === false; render(); },
  rescanStores: () => scanStores(),
  folderAdd: async () => { const r = await call(R.folderAdd()); if (r && r.id) { S = await R.state(); scanFolder(r.id); } },
  rescan: (el) => scanFolder(el.dataset.id),
  stopScan: (el) => R.stopScan(el.dataset.id),
  folderRemove: async (el) => {
    for (const c of ui.scan.results[el.dataset.id] || []) ui.scan.checked.delete(c.id);
    delete ui.scan.results[el.dataset.id];
    await call(R.folderRemove(el.dataset.id));
  },
  // ticking changes only that box and the count, so the list stays where it is
  check: (el) => {
    const s = ui.scan.checked, id = el.dataset.id;
    s.has(id) ? s.delete(id) : s.add(id);
    const on = s.has(id);
    el.setAttribute('aria-checked', String(on));
    el.innerHTML = on ? ic('check') : '';
    const f = $('.footerbar');
    if (f) f.innerHTML = footerHTML(scanTotal());
  },
  toggleSkipped: () => { ui.scan.showSkipped = !ui.scan.showSkipped; render(); },
  romNew: () => { ui.scan.romForm = { path: '', emulator: '', exts: '', label: '', args: '"{rom}"' }; render(); },
  romCancel: () => { ui.scan.romForm = null; render(); },
  romPick: async (el) => {
    const f = await R.pick(el.dataset.key === 'path' ? 'folder' : 'exe');
    if (f && !f.error) { ui.scan.romForm[el.dataset.key] = f; if (el.dataset.key === 'path' && !ui.scan.romForm.label) ui.scan.romForm.label = f.split(/[\\/]/).pop().slice(0, 12); render(); }
  },
  romSave: async () => { const r = await call(R.romSave(ui.scan.romForm)); if (r) { ui.scan.romForm = null; toast(`Found ${r.count} games in that ROM folder`); } },
  romRemove: (el) => call(R.romRemove(el.dataset.id)),
  addScanned: async () => {
    const sc = ui.scan;
    const all = Object.values(sc.results).flat();
    const picks = all.filter((c) => sc.checked.has(c.id)).map((c) => ({ id: c.id, exe: sc.exeChoice[c.id] || c.exe }));
    const stores = Object.fromEntries(STORE_ORDER.map((k) => [k, !!(sc.stores && sc.stores[k] && sc.stores[k].installed && sc.stores[k].fresh && sc.storesOn[k] !== false)]));
    const r = await call(R.addScanned({ stores, picks }));
    if (r) {
      toast(r.added ? `Added ${r.added} ${r.added === 1 ? 'game' : 'games'}. Covers are on the way.` : 'Those games were already in your library.');
      ui.scan = { ...ui.scan, stores: null, checked: new Set(), exeChoice: {}, results: {}, progress: {} };
      go('home');
    }
  },

  // found
  foundCheck: (el) => { const s = ui.found.checked, k = el.dataset.key; s.has(k) ? s.delete(k) : s.add(k); render(); },
  foundAdd: async () => { const keys = [...ui.found.checked]; const r = await call(R.foundAdd(keys)); if (r) toast(`Added ${r.added} ${r.added === 1 ? 'game' : 'games'}`); ui.found.checked = null; S = await R.state(); if (!(S.found || []).length) go('home'); else render(); },
  foundIgnore: async () => { const keys = [...ui.found.checked]; await call(R.foundIgnore(keys), `Ignored ${keys.length}`); ui.found.checked = null; },
  foundRecheck: async () => { toast('Checking your stores and folders…'); const r = await call(R.foundCheck()); if (r) toast(r.found ? `${r.found} new ${r.found === 1 ? 'game' : 'games'} waiting for review` : 'Nothing new found'); },

  // setup
  setupToggle: (el) => { ui.setup.on[el.dataset.key] = ui.setup.on[el.dataset.key] === false; render(); },
  setupAdd: async () => {
    const res = ui.setup.res;
    const stores = Object.fromEntries(STORE_ORDER.map((k) => [k, !!(res[k] && res[k].installed && res[k].fresh && ui.setup.on[k] !== false)]));
    const r = await call(R.addScanned({ stores, picks: [] }));
    if (r) { toast(`Added ${r.added} games. Covers are on the way.`); go('home'); }
  },
  setupFolder: async () => { await call(R.setSettings({ setupDone: true })); const r = await call(R.folderAdd()); go('scan'); if (r && r.id) { S = await R.state(); scanFolder(r.id); } },
  setupSkip: async () => { await call(R.setSettings({ setupDone: true })); go('home'); },

  // settings
  theme: (el) => call(R.setSettings({ theme: el.dataset.v })),
  setAccent: (el) => call(R.setSettings({ accent: el.dataset.v })),
  setShade: (el) => call(R.setSettings({ [el.dataset.key]: el.dataset.v })),
  setFont: (el) => call(R.setSettings({ font: el.dataset.v })),
  whilePlaying: (el) => call(R.setSettings({ whilePlaying: el.dataset.v })),
  setToggle: (el) => call(R.setSettings({ [el.dataset.key]: !S.settings[el.dataset.key] })),
  toggleSource: (el) => call(R.setSettings({ sources: { ...S.settings.sources, [el.dataset.key]: S.settings.sources[el.dataset.key] === false } })),
  saveKey: () => call(R.setSettings({ sgdbKey: $('#sgdb').value.trim() }), $('#sgdb').value.trim() ? 'Key saved. Looking for missing covers.' : 'Key removed'),
  getKey: () => call(R.openUrl('https://www.steamgriddb.com/profile/preferences/api')),
  saveSteamKey: () => call(R.setSettings({ steamApiKey: $('#steamkey').value.trim() }), $('#steamkey').value.trim() ? 'Steam key saved' : 'Steam key removed'),
  getSteamKey: () => call(R.openUrl('https://steamcommunity.com/dev/apikey')),
  refreshOwned: async () => { const r = await call(R.steamOwned()); if (r) toast(r.added ? `Added ${r.added} games you own` : 'Steam library is up to date'); },
  fillArt: () => call(R.setSettings({ fillArt: true }), 'Looking for missing covers'),
  ludusaviDownload: async (el) => { el.disabled = true; const r = await call(R.ludusaviDownload()); if (r) toast(`Ludusavi ${r.version} is ready`); else el.disabled = false; },
  ludusaviPick: () => call(R.ludusaviPick()),
  savesPickDir: () => call(R.savesPickDir()),
  exportLibrary: async () => { const r = await call(R.exportLibrary()); if (r && r.ok) toast(`Saved your library with ${r.covers} covers`); },
  importLibrary: async () => { const r = await call(R.importLibrary()); if (r && r.ok) { toast(`Restored ${r.games} games`); go('home'); } },
  checkUpdates: () => call(R.checkUpdates()),
  installUpdate: () => R.installUpdate(),
  openRelease: () => call(R.openUrl((S.update && S.update.url) || 'https://github.com/Hexnova-Nepal/rack/releases/latest')),
  openData: () => R.openData(),
};

/* ---------- events ---------- */

document.addEventListener('click', (e) => {
  // Ctrl or Shift + click selects games instead of opening them
  const item = e.target.closest('#view [data-gid].tile, #view tr.lrow[data-gid]');
  if (item && (e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest('.play, .rowplay')) { e.preventDefault(); selectClick(item.dataset.gid, e); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) {
    e.preventDefault();
    if (item && ui.sel.size && el.dataset.act === 'open') { ui.sel.clear(); renderDock(); }
    fn(el, e);
  }
});
document.addEventListener('dblclick', (e) => {
  const t = e.target.closest('button.hit[data-id], tr.lrow[data-id]');
  if (t && !e.ctrlKey && !e.shiftKey) { const g = byId(t.dataset.id); if (g && !g.missing) ACT.play(t); }
});
document.addEventListener('contextmenu', (e) => {
  const col = e.target.closest('[data-col]');
  if (col) { e.preventDefault(); R.collectionMenu(col.dataset.col); return; }
  const item = e.target.closest('[data-gid]');
  if (item) {
    e.preventDefault();
    const id = item.dataset.gid;
    R.menu(ui.sel.has(id) ? [...ui.sel] : [id]);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.act === 'sort') { ui.sort = el.value; call(R.setSettings({ sort: el.value })); render(); }
  if (el.dataset.act === 'filter') { ui.f[el.dataset.key] = el.value; el.blur(); render(); }
  if (el.dataset.act === 'addCol' && el.value) { ui.detail.draft.collections.push(el.value); el.blur(); render(); }
  if (el.dataset.act === 'exeChoice') ui.scan.exeChoice[el.dataset.id] = el.value;
  if (el.dataset.act === 'customAccent') call(R.setSettings({ accent: 'custom', accentCustom: el.value }));
  if (el.dataset.act === 'selStatus' && el.value) { call(R.bulk([...ui.sel], { status: el.value === 'none' ? '' : el.value })); el.value = ''; }
  if (el.dataset.act === 'selCollection' && el.value) {
    const v = el.value; el.value = '';
    if (v === '__new') newCollectionFor([...ui.sel]);
    else call(R.bulk([...ui.sel], { addCollection: v }), `Added ${ui.sel.size} games to ${(S.collections.find((c) => c.id === v) || {}).name}`);
  }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft) {
    ui.detail.draft[el.dataset.draft] = el.value;
    const g = byId(ui.detail.id), dirty = !sameDraft(ui.detail.draft, draftOf(g));
    for (const b of document.querySelectorAll('[data-act="save"],[data-act="discard"]')) b.disabled = !dirty;
  }
  if (el.dataset.na) { ui.detail.newAction[el.dataset.na] = el.value; const b = $('[data-act="naSave"]'); if (b) b.disabled = !(ui.detail.newAction.name.trim() && ui.detail.newAction.exe); }
  if (el.dataset.rom) ui.scan.romForm[el.dataset.rom] = el.value;
  if (el.id === 'search') {
    if (el.value.trim()) { if (ui.view !== 'search') { ui.back = { view: ui.view, arg: ui.arg }; ui.view = 'search'; ui.arg = null; } render(); }
    else if (ui.view === 'search') go(ui.back ? ui.back.view : 'home', ui.back ? ui.back.arg : null);
  }
});

/** Arrow keys move between games by where they sit on screen; Enter plays. */
function moveFocus(from, key) {
  const box = from.closest('.grid, .row, tbody');
  if (!box) return false;
  const items = [...box.querySelectorAll('[data-fk]')];
  const i = items.indexOf(from);
  if (i < 0) return false;
  let next = null;
  if (box.tagName === 'TBODY') next = key === 'ArrowDown' ? items[i + 1] : key === 'ArrowUp' ? items[i - 1] : null;
  else if (key === 'ArrowRight') next = items[i + 1];
  else if (key === 'ArrowLeft') next = items[i - 1];
  else {
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2;
    const rows = items.map((el) => [el, el.getBoundingClientRect()]).filter(([, b]) => (key === 'ArrowDown' ? b.top > r.bottom - 4 : b.bottom < r.top + 4));
    if (rows.length) {
      const edge = key === 'ArrowDown' ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));
      next = rows.filter(([, b]) => Math.abs(b.top - edge) < 8).sort((a, b) => Math.abs(a[1].left + a[1].width / 2 - cx) - Math.abs(b[1].left + b[1].width / 2 - cx))[0][0];
    }
  }
  if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); return true; }
  return false;
}
document.addEventListener('keydown', (e) => {
  if (ui.modal) { if (e.key === 'Escape') closeModal(false); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
  if (e.key === 'Escape' && document.activeElement === $('#search')) { $('#search').value = ''; $('#search').dispatchEvent(new Event('input', { bubbles: true })); $('#search').blur(); return; }
  if (e.key === 'Escape' && ui.sel.size) { ui.sel.clear(); syncSelection(); return; }
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing && (ui.view === 'games' || ui.view === 'search')) { e.preventDefault(); for (const id of visibleIds()) ui.sel.add(id); syncSelection(); return; }
  const fk = a && a.closest && a.closest('[data-fk]');
  if (!fk || typing) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { if (moveFocus(fk, e.key)) e.preventDefault(); return; }
  if (e.key === 'Enter') { e.preventDefault(); const g = byId(fk.dataset.id); if (g && !g.missing) ACT.play(fk); return; }
  if (e.key === ' ' && fk.tagName === 'TR') { e.preventDefault(); go('detail', fk.dataset.id); }
});
document.addEventListener('dragstart', (e) => e.preventDefault());

// thumbnails under the rack point at their cartridge
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest && e.target.closest('.thumbs button');
  if (t && rackHandle && rackHandle.pick) rackHandle.pick(cartOf(Number(t.dataset.slot)));
});
document.addEventListener('pointerout', (e) => {
  const t = e.target.closest && e.target.closest('.thumbs');
  if (t && !t.contains(e.relatedTarget) && rackHandle && rackHandle.pick) rackHandle.pick(-1);
});

/* ---------- start ---------- */

R.onToast(({ text, kind }) => toast(text, kind));
R.onScanProgress((p) => {
  ui.scan.progress[p.id] = p;
  const m = document.querySelector(`.folder[data-folder="${p.id}"] .muted`);
  if (m) m.textContent = progressText(p);
});
R.onState((s) => { S = s; render(); });
R.onTheme(() => applyAppearance());
R.onGo((v) => go(v));
R.onMenu(({ action, ids, id }) => {
  if (action === 'open') go('detail', ids[0]);
  if (action === 'newCollection') newCollectionFor(ids || []);
  if (action === 'remove') removeIds(ids);
  if (action === 'uninstall') uninstallAsk(ids[0]);
  if (action === 'renameCollection') ACT.renameCollection({ dataset: { id } });
  if (action === 'deleteCollection') ACT.deleteCollection({ dataset: { id } });
});

(async () => {
  S = await R.state();
  applyAppearance();
  await figReady.catch(() => null);
  if (!S.settings.setupDone && !S.games.length) ui.view = 'setup';
  render();
})();

// The quick-launch box: type a few letters of a game's name, press Enter.
import { search } from './match.mjs';

const R = window.rack;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SRC = { steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', ea: 'EA', battlenet: 'Battle.net', xbox: 'Xbox', folder: 'Folder', manual: 'Manual' };
const hours = (min) => (!min ? 'Not played yet' : min < 60 ? `${min} min` : `${Math.round(min / 60).toLocaleString()} h`);
const LOOK = { bg: '--bg', raise: '--raise', hover: '--hover', line: '--line', ink: '--ink', soft: '--soft', faint: '--faint', accent: '--accent', accentInk: '--accent-ink', signal: '--signal' };

let games = [], shown = [], sel = 0, error = '';

function applyLook(look) {
  const root = document.documentElement;
  if (!look) return;
  for (const [k, v] of Object.entries(LOOK)) if (look[k]) root.style.setProperty(v, look[k]);
  root.style.setProperty('color-scheme', look.dark === false ? 'light' : 'dark');
  if (look.font) root.dataset.font = look.font;
}

function draw() {
  const typed = $('#q').value;
  shown = search(games, typed, typed.trim() ? 8 : 6);
  sel = Math.max(0, Math.min(sel, shown.length - 1));
  const head = $('#qhead');
  head.className = 'qhead' + (error ? ' warn' : '');
  head.textContent = error || (typed.trim() ? '' : games.some((g) => g.lastPlayed) ? 'Played last' : games.length ? 'Your games' : '');
  $('#qlist').innerHTML = shown.length ? shown.map((g, i) => `<button class="qrow" role="option" id="qr${i}" data-i="${i}" aria-selected="${i === sel}" tabindex="-1">
      <span class="cover">${g.cover ? `<img src="${window.RACK_THUMB_BASE || 'rack://thumb/'}${encodeURIComponent(g.cover)}" alt="" draggable="false">` : '<span class="ph"></span>'}</span>
      <b>${esc(g.name)}</b>${g.running ? '<span class="tagp">Playing</span>' : ''}<small>${esc(g.source === 'emulator' ? g.platform || 'Emulator' : SRC[g.source] || 'Game')} · ${esc(hours(g.total))}</small></button>`).join('')
    : `<p class="qempty">${games.length ? `No game matches “${esc(typed.trim())}”.` : 'Your library is empty. Open Rack and scan for games first.'}</p>`;
  $('#q').setAttribute('aria-activedescendant', shown.length ? `qr${sel}` : '');
  $('#qfoot').hidden = !shown.length;
  R.quickSize(Math.ceil($('#qbox').getBoundingClientRect().height));
}
function mark() {
  document.querySelectorAll('.qrow').forEach((el, i) => el.setAttribute('aria-selected', String(i === sel)));
  $('#q').setAttribute('aria-activedescendant', shown.length ? `qr${sel}` : '');
}

async function load() {
  const r = await R.quickList();
  games = (r && r.games) || [];
  applyLook(r && r.look);
  draw();
}
async function start(i, details) {
  const g = shown[i];
  if (!g) return;
  if (details) { R.quickOpen(g.id); return; }
  const r = await R.quickPlay(g.id);
  if (r && r.error) { error = r.error; draw(); }
}

$('#q').addEventListener('input', () => { sel = 0; error = ''; draw(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); R.quickHide(); return; }
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); if (shown.length) { sel = (sel + 1) % shown.length; mark(); } return; }
  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); if (shown.length) { sel = (sel - 1 + shown.length) % shown.length; mark(); } return; }
  if (e.key === 'Enter') { e.preventDefault(); start(sel, e.ctrlKey || e.metaKey); }
});
$('#qlist').addEventListener('pointermove', (e) => { const r = e.target.closest('.qrow'); if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); mark(); } });
$('#qlist').addEventListener('click', (e) => { const r = e.target.closest('.qrow'); if (r) start(Number(r.dataset.i), e.ctrlKey || e.metaKey); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('input')) e.preventDefault(); }); // keep the typing box focused

// each time the box is shown again: empty, fresh list, ready to type
R.onQuickShow(() => { $('#q').value = ''; sel = 0; error = ''; load(); $('#q').focus(); });
load();
$('#q').focus();

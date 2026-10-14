// Starts games, and times them by watching which programs are running.
// Games started anywhere (Steam, a shortcut, the Start menu) are timed too, while Rack runs in the tray.
'use strict';
const fs = require('fs');
const path = require('path');
const winapi = require('./winapi');
const { junkReason } = require('./detect');

/** Splits a command line into arguments, keeping quoted parts together. */
function splitArgs(s) {
  const out = [];
  let cur = '', q = false, any = false;
  for (const c of String(s || '')) {
    if (c === '"') { q = !q; any = true; continue; }
    if (!q && /\s/.test(c)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** What to run: { kind: 'uri', uri } or { kind: 'exe', file, args, cwd, admin }. action is one of the game's extra launch options. */
function plan(game, romFolder, action) {
  if (action) {
    if (!action.exe) throw new Error('This launch option has no program set');
    return { kind: 'exe', file: action.exe, args: action.args || '', cwd: action.cwd || path.dirname(action.exe), admin: !!action.admin };
  }
  if (game.notInstalled && game.source === 'steam') return { kind: 'uri', uri: `steam://install/${game.sourceId}` };
  if (game.uri) return { kind: 'uri', uri: game.uri };
  if (game.source === 'emulator') {
    if (!romFolder || !romFolder.emulator) throw new Error('This ROM folder has no emulator set. Pick one in Scan for games.');
    const tpl = romFolder.args && romFolder.args.includes('{rom}') ? romFolder.args : '"{rom}"';
    const args = splitArgs(tpl).map((a) => a.replace('{rom}', game.rom));
    return { kind: 'exe', file: romFolder.emulator, args, cwd: path.dirname(romFolder.emulator), admin: false };
  }
  if (!game.exe) throw new Error('This game has no launch file. Set one in its details.');
  return { kind: 'exe', file: game.exe, args: game.args || '', cwd: game.cwd || path.dirname(game.exe), admin: !!game.admin };
}

/** Starts it. Programs go through Windows (ShellExecute), which asks for admin rights when a game needs them. */
async function start(p, openExternal) {
  if (p.kind === 'uri') {
    if (/^shell:/i.test(p.uri)) { if (!(await winapi.open(p.uri))) throw new Error('Windows could not start this game'); return; }
    return openExternal(p.uri);
  }
  if (!fs.existsSync(p.file)) throw new Error(`Launch file not found: ${p.file}`);
  const ok = await winapi.open(p.file, p.args, p.cwd, p.admin);
  if (!ok && process.platform === 'win32') throw new Error(p.admin ? 'The game was not started. Permission was refused, or Windows could not start it.' : 'Windows could not start this game');
}

const low = (s) => path.normalize(String(s || '')).toLowerCase().replace(/[\\/]+$/, '');
const isDriveRoot = (d) => low(path.parse(path.resolve(d)).root) === low(d);

/**
 * The folders that belong to each game, for matching running programs.
 * A folder that is a whole drive, or holds other games, belongs to nobody.
 */
function gameFolders(games) {
  const list = [];
  for (const g of games) {
    if (g.notInstalled || g.source === 'emulator') continue;
    const dirs = new Set();
    if (g.installDir) dirs.add(low(g.installDir));
    if (g.exe && !g.uri) dirs.add(low(path.dirname(g.exe)));
    for (const d of dirs) if (d && !isDriveRoot(d)) list.push({ id: g.id, dir: d });
  }
  // drop folders that contain another game's folder: they are libraries, not games
  return list.filter((a) => !list.some((b) => b.id !== a.id && b.dir !== a.dir && b.dir.startsWith(a.dir + path.sep)));
}

/**
 * Tracker: one check every few seconds. A session starts when a program inside a game's folder is running,
 * and ends when none has been seen for two checks in a row.
 */
class Tracker {
  constructor({ games, onStart, onEnd, onGiveUp, listRunning = winapi.running, background = () => true }) {
    this.games = games;               // () => current library
    this.cb = { onStart, onEnd, onGiveUp };
    this.list = listRunning;
    this.background = background;     // () => whether to time games Rack didn't start
    this.sessions = new Map();        // id -> { start, lastSeen, misses, external }
    this.expected = new Map();        // id -> { since, dirs }  launched by Rack, not seen yet
    this.timer = null;
    this.folders = null;
  }

  refreshFolders() { this.folders = null; }

  watch(game, extraFile) {
    const dirs = [];
    if (game.source === 'emulator') { if (extraFile) dirs.push(low(path.dirname(extraFile))); }
    else { if (game.installDir) dirs.push(low(game.installDir)); if (game.exe) dirs.push(low(path.dirname(game.exe))); if (extraFile) dirs.push(low(path.dirname(extraFile))); }
    this.expected.set(game.id, { since: Date.now(), dirs: dirs.filter((d) => d && !isDriveRoot(d)) });
    this.schedule(2500);
  }

  running() { return [...this.sessions.keys()]; }
  launching() { return [...this.expected.keys()].filter((id) => !this.sessions.has(id)); }
  startedAt(id) { const s = this.sessions.get(id); return s ? s.start : null; }

  /** Ends a session now, for when the game closed but something of it keeps running. */
  stop(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    this.expected.delete(id);
    this.ignoreUntilGone = this.ignoreUntilGone || new Set();
    this.ignoreUntilGone.add(id);
    this.cb.onEnd(id, { start: s.start, minutes: Math.round((Date.now() - s.start) / 60000), external: s.external });
  }

  begin() { this.schedule(1000); }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  tick() {
    const now = Date.now();
    let paths = [];
    try { paths = this.list(); } catch { paths = []; }
    if (!this.folders) this.folders = gameFolders(this.games());
    const seen = new Set();
    // programs of a game, but not its helpers (crash reporters, updaters, launchers' web views...)
    const useful = paths.filter((p) => !junkReason(path.basename(p, '.exe')));
    for (const p of useful) {
      let best = null;
      for (const f of this.folders) if (p.startsWith(f.dir + path.sep) && (!best || f.dir.length > best.dir.length)) best = f;
      if (best) seen.add(best.id);
    }
    for (const [id, e] of this.expected) {
      if (useful.some((p) => e.dirs.some((d) => p.startsWith(d + path.sep)))) seen.add(id);
      else if (!this.sessions.has(id) && now - e.since > 180000) { this.expected.delete(id); this.cb.onGiveUp(id); }
    }
    if (this.ignoreUntilGone) for (const id of [...this.ignoreUntilGone]) { if (seen.has(id)) seen.delete(id); else this.ignoreUntilGone.delete(id); }
    for (const id of seen) {
      const s = this.sessions.get(id);
      if (s) { s.lastSeen = now; s.misses = 0; continue; }
      const external = !this.expected.has(id);
      if (external && !this.background()) continue;
      this.sessions.set(id, { start: now, lastSeen: now, misses: 0, external });
      this.cb.onStart(id, { external });
    }
    for (const [id, s] of this.sessions) {
      if (seen.has(id)) continue;
      if (++s.misses >= 2) {
        this.sessions.delete(id);
        this.expected.delete(id);
        this.cb.onEnd(id, { start: s.start, minutes: Math.round((s.lastSeen - s.start) / 60000), external: s.external });
      }
    }
    // fast while waiting for a game Rack started, steady while one runs, slow otherwise
    this.schedule(this.launching().length ? 3000 : this.sessions.size ? 10000 : this.background() ? 15000 : 60000);
  }

  /** Time so far for every running session, for when Rack quits mid-game. */
  flush() {
    const out = [...this.sessions].map(([id, s]) => ({ id, start: s.start, minutes: Math.round((s.lastSeen - s.start) / 60000) }));
    this.sessions.clear();
    return out;
  }
}

module.exports = { plan, start, Tracker, splitArgs, gameFolders };

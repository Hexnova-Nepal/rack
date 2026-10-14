// Finds installed games: store records first (exact), then folders (guessed, reviewed by the user).
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const vdf = require('./vdf');

const isWin = process.platform === 'win32';

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, out) => resolve(err ? '' : out));
  });
}

/** Parses `reg query ... /s` output into { keyPath: { valueName: value } }. */
function parseReg(text) {
  const out = {};
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(raw)) { cur = out[raw.trim()] = {}; continue; }
    const m = /^\s{2,}(.+?)\s{2,}(REG_\w+)\s{2,}(.*)$/.exec(raw) || /^\s{2,}(.+?)\s{2,}(REG_\w+)\s*$/.exec(raw);
    if (m && cur) cur[m[1]] = m[3] !== undefined ? m[3].trim() : '';
  }
  return out;
}

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

/* ---------------- Steam ---------------- */

const STEAM_NOT_GAMES = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '250820', '1826330', '1161040']);
const STEAM_NOT_GAME_NAMES = /^(proton\b|steam linux runtime|steamworks common|steamvr$|steam audio)/i;

async function steamRoot(opts = {}) {
  if (opts.steamRoot) return opts.steamRoot;
  if (isWin) {
    const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out);
    if (m && exists(m[1].trim())) return path.normalize(m[1].trim());
    for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) if (exists(p)) return p;
  }
  return null;
}

/** Steam's own hours and last-played time, per app id, across every account on this PC. */
function steamPlaytime(root) {
  const out = {};
  const ud = path.join(root, 'userdata');
  let users = [];
  try { users = fs.readdirSync(ud); } catch { return out; }
  for (const u of users) {
    const text = readText(path.join(ud, u, 'config', 'localconfig.vdf'));
    if (!text) continue;
    const apps = vdf.get(vdf.parse(text), 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps') || {};
    for (const [id, a] of Object.entries(apps)) {
      const min = Number(vdf.get(a, 'Playtime')) || 0;
      const last = (Number(vdf.get(a, 'LastPlayed')) || 0) * 1000;
      const prev = out[id] || { min: 0, last: 0 };
      out[id] = { min: Math.max(prev.min, min), last: Math.max(prev.last, last) };
    }
  }
  return out;
}

async function scanSteam(opts = {}) {
  const root = await steamRoot(opts);
  if (!root) return { installed: false, games: [] };
  const libs = new Set([root]);
  const lf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf'));
  if (lf) {
    const data = vdf.get(vdf.parse(lf), 'libraryfolders') || {};
    for (const v of Object.values(data)) {
      const p = typeof v === 'string' ? v : vdf.get(v, 'path');
      if (p && /^[a-z]:|^\//i.test(p)) libs.add(path.normalize(p));
    }
  }
  const hours = steamPlaytime(root);
  const games = [];
  const seen = new Set();
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      const st = vdf.get(vdf.parse(readText(path.join(dir, f)) || ''), 'AppState');
      if (!st) continue;
      const id = String(vdf.get(st, 'appid') || '');
      const name = String(vdf.get(st, 'name') || '').trim();
      const flags = Number(vdf.get(st, 'StateFlags')) || 0;
      if (!id || !name || seen.has(id) || STEAM_NOT_GAMES.has(id) || STEAM_NOT_GAME_NAMES.test(name)) continue;
      if (!(flags & 4)) continue; // not fully installed
      seen.add(id);
      const h = hours[id] || { min: 0, last: 0 };
      games.push({
        source: 'steam', sourceId: id, name,
        installDir: path.join(dir, 'common', String(vdf.get(st, 'installdir') || '')),
        uri: `steam://rungameid/${id}`,
        steamPlaytime: h.min, steamLastPlayed: h.last || null,
      });
    }
  }
  return { installed: true, root, games };
}

/** Steam keeps cover art for installed games on disk; use it before asking the internet. */
function steamCachedCover(root, appid) {
  if (!root) return null;
  const lc = path.join(root, 'appcache', 'librarycache');
  const flat = path.join(lc, `${appid}_library_600x900.jpg`);
  if (exists(flat)) return flat;
  const dir = path.join(lc, String(appid));
  const look = (d, depth) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
    const hit = items.find((e) => e.isFile() && /^library_600x900(_2x)?\.jpg$/i.test(e.name));
    if (hit) return path.join(d, hit.name);
    if (depth > 0) for (const e of items) if (e.isDirectory()) { const r = look(path.join(d, e.name), depth - 1); if (r) return r; }
    return null;
  };
  return look(dir, 2);
}

/* ---------------- Epic ---------------- */

async function scanEpic(opts = {}) {
  const dir = opts.epicDir || path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.item')); } catch { return { installed: false, games: [] }; }
  const games = [];
  for (const f of files) {
    let m;
    try { m = JSON.parse(readText(path.join(dir, f))); } catch { continue; }
    if (!m || m.bIsIncompleteInstall) continue;
    if (Array.isArray(m.AppCategories) && m.AppCategories.length && !m.AppCategories.includes('games')) continue;
    if (m.MainGameAppName && m.AppName && m.MainGameAppName !== m.AppName) continue; // DLC
    if (!m.InstallLocation || !m.DisplayName) continue;
    const key = `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`;
    games.push({
      source: 'epic', sourceId: m.AppName || key, name: m.DisplayName,
      installDir: path.normalize(m.InstallLocation),
      exe: m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : '',
      uri: `com.epicgames.launcher://apps/${encodeURIComponent(key)}?action=launch&silent=true`,
    });
  }
  return { installed: true, games };
}

/* ---------------- GOG ---------------- */

async function scanGog(opts = {}) {
  const text = opts.gogRegText !== undefined ? opts.gogRegText
    : isWin ? await run('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', '/s']) : '';
  if (!text.trim()) return { installed: false, games: [] };
  const games = [];
  for (const [key, v] of Object.entries(parseReg(text))) {
    const id = v.gameID || key.split('\\').pop();
    if (!v.gameName || !v.exe || (v.dependsOn && v.dependsOn.trim())) continue;
    games.push({
      source: 'gog', sourceId: String(id), name: v.gameName,
      installDir: v.path ? path.normalize(v.path) : path.dirname(v.exe),
      exe: v.exe, cwd: v.workingDir || v.path || path.dirname(v.exe), args: v.launchParam || '',
    });
  }
  return { installed: true, games };
}

/* ---------------- ROM folders ---------------- */

async function scanRoms(rf) {
  const exts = (rf.exts || []).map((x) => x.toLowerCase().replace(/^\*?\.?/, '.'));
  const found = [];
  async function walk(dir, depth) {
    let items;
    try { items = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of items) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 2) await walk(full, depth + 1);
      else if (e.isFile() && exts.includes(path.extname(e.name).toLowerCase())) found.push(full);
    }
  }
  await walk(rf.path, 0);
  const { cleanName } = require('./detect');
  return found.map((file) => ({
    source: 'emulator', sourceId: file, name: cleanName(path.basename(file, path.extname(file))), platform: rf.label,
    rom: file, romFolderId: rf.id,
  }));
}

const steamNotGame = (id, name) => STEAM_NOT_GAMES.has(String(id)) || STEAM_NOT_GAME_NAMES.test(name || '');

module.exports = { scanSteam, scanEpic, scanGog, scanRoms, steamCachedCover, steamRoot, parseReg, steamNotGame };

// More stores: Ubisoft Connect, EA app, Battle.net, Xbox app, and Steam games you own but haven't installed.
// Each reader returns { installed, games: [{ source, sourceId, name, installDir, uri?, exe? }] }.
'use strict';
const fs = require('fs');
const path = require('path').win32; // these records only ever hold Windows paths
const { execFile } = require('child_process');
const { parseReg } = require('./scan');
const vdf = require('./vdf');

const isWin = process.platform === 'win32';
const run = (cmd, args, timeout = 30000) => new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (e, out) => resolve(e ? '' : out)));
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const clean = (p) => String(p || '').replace(/^"|"$/g, '').replace(/[\\/]+$/, '');

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];
let uninstallCache = null;
/** Windows' list of installed programs, read once per scan. Pass texts to read from fixtures. */
async function uninstallEntries(texts) {
  if (!texts && uninstallCache && Date.now() - uninstallCache.at < 20000) return uninstallCache.list;
  const all = texts || (isWin ? await Promise.all(UNINSTALL_KEYS.map((k) => run('reg', ['query', k, '/s']))) : []);
  const list = [];
  for (const t of all) for (const [key, v] of Object.entries(parseReg(t))) {
    if (!v.DisplayName) continue;
    list.push({ key, id: key.split('\\').pop(), name: v.DisplayName, publisher: v.Publisher || '', location: clean(v.InstallLocation), uninstall: v.UninstallString || '', icon: clean(v.DisplayIcon).replace(/,\s*-?\d+$/, '') });
  }
  if (!texts) uninstallCache = { at: Date.now(), list };
  return list;
}

/* ---------- Ubisoft Connect ---------- */

async function scanUbisoft(opts = {}) {
  const text = opts.regText !== undefined ? opts.regText : isWin ? await run('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs', '/s']) : '';
  if (!text.trim()) return { installed: false, games: [] };
  const entries = await uninstallEntries(opts.uninstallTexts);
  const games = [];
  for (const [key, v] of Object.entries(parseReg(text))) {
    const id = key.split('\\').pop();
    const dir = clean(v.InstallDir).replace(/\//g, '\\');
    if (!/^\d+$/.test(id) || !dir || (!opts.skipExists && !exists(dir))) continue;
    const named = entries.find((e) => e.id.toLowerCase() === `uplay install ${id}`);
    games.push({ source: 'ubisoft', sourceId: id, name: (named && named.name) || path.basename(dir), installDir: path.normalize(dir), uri: `uplay://launch/${id}/0` });
  }
  return { installed: true, games };
}

/* ---------- EA app ---------- */

async function scanEA(opts = {}) {
  const entries = await uninstallEntries(opts.uninstallTexts);
  const ea = entries.filter((e) => /electronic arts|^ea\b|ea swiss|respawn|maxis|bioware|dice|codemasters|criterion/i.test(e.publisher)
    && e.location && (opts.skipExists || exists(path.join(e.location, '__Installer')))
    && !/^ea( app| desktop)?$|origin$|^ea installer/i.test(e.name));
  const appThere = entries.some((e) => /^ea app$|^ea desktop$/i.test(e.name)) || exists('C:\\Program Files\\Electronic Arts\\EA Desktop');
  const seen = new Set();
  const games = [];
  for (const e of ea) {
    const dir = path.normalize(e.location);
    if (seen.has(dir.toLowerCase())) continue;
    seen.add(dir.toLowerCase());
    games.push({ source: 'ea', sourceId: e.id, name: e.name.replace(/[™®]/g, '').trim(), installDir: dir, needsExe: true });
  }
  return { installed: appThere || games.length > 0, games };
}

/* ---------- Battle.net ---------- */

// the uid in Blizzard's uninstaller, and the code that battlenet:// understands
const BNET = {
  wow: 'WoW', wow_classic: 'WoWC', wow_classic_era: 'WoWC', fenris: 'Fen', diablo3: 'D3', prometheus: 'Pro', overwatch: 'Pro', hs_beta: 'WTCG', hearthstone: 'WTCG',
  s2: 'S2', sc2: 'S2', s1: 'S1', heroes: 'Hero', w3: 'W3', anbs: 'ANBS', viper: 'VIPR', odin: 'ODIN', lazarus: 'LAZR', fore: 'FORE', zeus: 'ZEUS', auks: 'AUKS',
  rtro: 'RTRO', wlby: 'WLBY', osi: 'OSI', gryphon: 'GRY', aqua: 'AQUA', spot: 'SPOT', pinta: 'PNTA',
};
async function scanBattleNet(opts = {}) {
  const entries = await uninstallEntries(opts.uninstallTexts);
  const appThere = entries.some((e) => /^battle\.net$/i.test(e.name));
  const games = [];
  for (const e of entries) {
    if (!/blizzard entertainment|activision/i.test(e.publisher) || /^battle\.net$/i.test(e.name)) continue;
    const uid = (/--uid=([\w-]+)/i.exec(e.uninstall) || [])[1];
    if (!uid || !e.location || (!opts.skipExists && !exists(e.location))) continue;
    const code = BNET[uid.toLowerCase()] || BNET[uid.toLowerCase().replace(/_\w+$/, '')];
    games.push({ source: 'battlenet', sourceId: uid, name: e.name.replace(/[™®]/g, '').trim(), installDir: path.normalize(e.location), uri: code ? `battlenet://${code}` : '', needsExe: !code });
  }
  return { installed: appThere || games.length > 0, games };
}

/* ---------- Xbox app (PC Game Pass and Microsoft Store games) ---------- */

const XBOX_PS = `
$ErrorActionPreference = 'SilentlyContinue'
$out = @()
foreach ($p in Get-AppxPackage) {
  if (-not $p.InstallLocation -or $p.IsFramework) { continue }
  $cfg = Join-Path $p.InstallLocation 'MicrosoftGame.config'
  if (-not (Test-Path -LiteralPath $cfg)) { continue }
  $m = Get-AppxPackageManifest $p
  $app = @($m.Package.Applications.Application)[0]
  $title = ''
  try { [xml]$x = Get-Content -LiteralPath $cfg -Raw; $title = $x.Game.ShellVisuals.DefaultDisplayName } catch {}
  if (-not $title -or $title -like 'ms-resource*') { $title = $m.Package.Properties.DisplayName }
  $out += [pscustomobject]@{ name = $title; family = $p.PackageFamilyName; app = $app.Id; dir = $p.InstallLocation; pkg = $p.Name }
}
$out | ConvertTo-Json -Compress
`;
async function scanXbox(opts = {}) {
  const raw = opts.json !== undefined ? opts.json : isWin ? await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', XBOX_PS], 60000) : '';
  let list = [];
  try { const j = JSON.parse(raw || '[]'); list = Array.isArray(j) ? j : [j]; } catch { list = []; }
  const games = [];
  for (const x of list) {
    if (!x || !x.family || !x.app || !x.dir) continue;
    let name = String(x.name || '').trim();
    if (!name || /^ms-resource/i.test(name)) {
      const dir = path.basename(x.dir).toLowerCase() === 'content' ? path.dirname(x.dir) : x.dir;
      name = /xboxgames/i.test(path.basename(path.dirname(dir))) ? path.basename(dir) : String(x.pkg || x.family).split('.').pop().replace(/_\w+$/, '');
    }
    games.push({ source: 'xbox', sourceId: x.family, name: name.replace(/[™®]/g, '').trim(), installDir: path.normalize(x.dir), uri: `shell:AppsFolder\\${x.family}!${x.app}` });
  }
  return { installed: isWin || list.length > 0, games };
}

/* ---------- Steam: the account signed in on this PC, and everything it owns ---------- */

/** SteamID64 of the account Steam remembers most recently, from loginusers.vdf. */
function steamAccount(steamRoot, text) {
  const t = text !== undefined ? text : (() => { try { return fs.readFileSync(path.join(steamRoot, 'config', 'loginusers.vdf'), 'utf8'); } catch { return ''; } })();
  const users = vdf.get(vdf.parse(t || ''), 'users') || {};
  const list = Object.entries(users).map(([id, u]) => ({ id, name: vdf.get(u, 'PersonaName') || vdf.get(u, 'AccountName') || '', recent: vdf.get(u, 'MostRecent') === '1', ts: Number(vdf.get(u, 'Timestamp')) || 0 }));
  list.sort((a, b) => (b.recent - a.recent) || (b.ts - a.ts));
  return list[0] || null;
}

/** Owned games from the Steam Web API: [{ appid, name, minutes, lastPlayed }] */
async function steamOwned(fetchJson, key, steamId) {
  if (!key) throw new Error('Add your Steam Web API key in Settings');
  if (!/^\d{17}$/.test(String(steamId || ''))) throw new Error('Rack could not find your Steam account. Sign in to Steam on this PC first.');
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const data = await fetchJson(url);
  const r = data && data.response;
  if (!r || !Array.isArray(r.games)) throw new Error('Steam returned no games. Set “Game details” to Public in your Steam privacy settings, or check the key.');
  return r.games.map((g) => ({ appid: String(g.appid), name: g.name || `App ${g.appid}`, minutes: g.playtime_forever || 0, lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : null }));
}

module.exports = { scanUbisoft, scanEA, scanBattleNet, scanXbox, steamAccount, steamOwned, uninstallEntries, BNET };

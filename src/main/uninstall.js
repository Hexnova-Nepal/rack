// Works out how to uninstall a game, and does it.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { parseReg } = require('./scan');

const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (e, out) => resolve(e ? '' : out)));

const KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/** Every program Windows knows how to uninstall: [{ name, location, command, icon }] */
async function windowsEntries(texts) {
  const all = texts || (process.platform === 'win32' ? await Promise.all(KEYS.map((k) => run('reg', ['query', k, '/s']))) : []);
  const out = [];
  for (const t of all) {
    for (const v of Object.values(parseReg(t))) {
      const command = v.UninstallString || v.QuietUninstallString;
      if (!command || !v.DisplayName || v.SystemComponent === '0x1') continue;
      out.push({ name: v.DisplayName, location: (v.InstallLocation || '').replace(/^"|"$/g, '').replace(/[\\/]+$/, ''), command, icon: (v.DisplayIcon || '').replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '') });
    }
  }
  return out;
}

const low = (s) => path.normalize(String(s || '')).toLowerCase().replace(/[\\/]+$/, '');
const within = (p, dir) => !!p && !!dir && (low(p) === low(dir) || low(p).startsWith(low(dir) + path.sep));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The Windows uninstall entry for this game, if any. */
function matchEntry(game, entries) {
  const dir = game.installDir;
  const exeOf = (cmd) => { const m = /^"([^"]+)"|^(\S+\.exe)/i.exec(cmd.trim()); return m ? m[1] || m[2] : ''; };
  const deep = (loc) => loc.split(/[\\/]/).filter(Boolean).length >= 3 && !/^(games?|my games|common|steamapps|steamlibrary|epic games|gog games|xboxgames|program files( \(x86\))?)$/i.test(path.basename(loc));
  return entries.find((e) => dir && e.location && low(e.location) === low(dir))
    || entries.find((e) => dir && e.location && within(dir, e.location) && deep(e.location))
    || entries.find((e) => dir && (within(exeOf(e.command), dir) || within(e.icon, dir)));
}

/** "C:\x\unins000.exe" /SILENT -> { file, args }; MsiExec /I{GUID} becomes /X so it uninstalls. */
function splitCommand(cmd) {
  const s = cmd.trim();
  let file, rest;
  const q = /^"([^"]+)"\s*(.*)$/.exec(s);
  if (q) { file = q[1]; rest = q[2]; } else {
    const m = /^(.+?\.exe)\b\s*(.*)$/i.exec(s);
    if (m) { file = m[1]; rest = m[2]; } else { file = s.split(/\s+/)[0]; rest = s.slice(file.length).trim(); }
  }
  if (/msiexec(\.exe)?$/i.test(file)) rest = rest.replace(/\/I\s*\{/i, '/X{');
  return { file, args: rest };
}

/** Folders that must never be moved to the Recycle Bin as "the game". */
function unsafeFolder(dir, { otherGames = [], scanFolders = [] } = {}) {
  if (!dir) return 'No game folder is known';
  const d = low(dir);
  const parsed = path.parse(path.resolve(dir));
  if (low(parsed.root) === d) return 'The game folder is a whole drive';
  const home = low(os.homedir());
  const bad = [home, path.join(home, 'desktop'), path.join(home, 'documents'), path.join(home, 'downloads'), path.join(home, 'appdata'), path.join(home, 'onedrive'),
    'c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata', 'c:\\users'].map(low);
  if (bad.includes(d) || (d.startsWith('c:\\windows' + path.sep))) return 'That folder is a system or personal folder';
  if (/^(games?|my games|steamlibrary|steamapps|common|epic games|gog games|xboxgames|program files( \(x86\))?|downloads|desktop|documents)$/i.test(path.basename(dir))) return 'That folder looks like a library of games, not one game';
  if (scanFolders.some((f) => low(f) === d)) return 'That is one of your scan folders, not one game';
  if (otherGames.some((g) => within(g.exe || g.installDir || g.rom, dir))) return 'Other games in your library are inside that folder';
  if (fs.existsSync(path.join(dir, 'steamapps'))) return 'That folder holds a Steam library';
  return null;
}

async function folderSize(dir, budgetMs = 2500) {
  const end = Date.now() + budgetMs;
  let total = 0, complete = true;
  const stack = [dir];
  while (stack.length) {
    if (Date.now() > end) { complete = false; break; }
    const d = stack.pop();
    let items = [];
    try { items = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of items) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { try { total += (await fsp.stat(p)).size; } catch { /* skip */ } }
    }
  }
  return { bytes: total, complete };
}

/**
 * plan(game, ctx) -> { method, title, detail, warning?, run }  (run is filled in by the caller)
 * methods: steam | epic | entry | own | trash | rom | none
 */
async function plan(game, ctx) {
  const dir = game.installDir;
  if (game.source === 'emulator') {
    return { method: 'rom', title: 'Move the ROM file to the Recycle Bin', detail: game.rom };
  }
  if (game.source === 'steam' && game.sourceId) {
    return { method: 'steam', title: 'Steam will uninstall it', detail: 'Rack opens Steam’s uninstall window. Rack removes the game from your library once its folder is gone.', uri: `steam://uninstall/${game.sourceId}` };
  }
  if (game.source === 'epic') {
    return { method: 'epic', title: 'Uninstall it in the Epic Games Launcher', detail: 'Epic doesn’t let other apps uninstall its games. Rack opens the launcher: find the game in your Library, click the three dots, then Uninstall. Rack removes it from your library once its folder is gone.' };
  }
  const entries = await windowsEntries(ctx.regTexts);
  const entry = matchEntry(game, entries);
  if (entry) {
    const { file, args } = splitCommand(entry.command);
    return { method: 'entry', title: 'Run the game’s uninstaller', detail: `Windows lists it as “${entry.name}”. Its uninstaller will open and may ask for permission.`, file, args };
  }
  if (dir && fs.existsSync(dir)) {
    let own = [];
    try { own = (await fsp.readdir(dir)).filter((n) => /^(unins\d{3}|uninstall|uninst)\.exe$/i.test(n)); } catch { /* none */ }
    if (own.length) return { method: 'own', title: 'Run the game’s uninstaller', detail: `Found ${own[0]} in the game folder. It will open and may ask for permission.`, file: path.join(dir, own.sort()[0]), args: '' };
  }
  const why = unsafeFolder(dir, ctx);
  if (why || !dir || !fs.existsSync(dir)) {
    return { method: 'none', title: 'Rack can’t uninstall this game safely', detail: `${why || 'The game folder was not found'}. You can still remove it from your library.` };
  }
  const size = await folderSize(dir);
  const gb = size.bytes / 1073741824;
  const sizeText = gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(size.bytes / 1048576))} MB`;
  return {
    method: 'trash', title: 'Move the game folder to the Recycle Bin',
    detail: `${dir} (${size.complete ? '' : 'at least '}${sizeText}). This game has no uninstaller, so Rack deletes its folder. Saves kept elsewhere are not touched.`,
    warning: gb > 20 ? 'Very large folders may not fit in the Recycle Bin, and Windows may then delete them for good.' : null,
    dir,
  };
}

/** Where the Epic Games Launcher is installed. */
async function epicLauncher() {
  const out = process.platform === 'win32' ? await run('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', '/v', 'AppDataPath']) : '';
  const guesses = [
    'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
    'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
    'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe',
  ];
  const m = /AppDataPath\s+REG_SZ\s+(.+)/i.exec(out);
  if (m) guesses.unshift(path.join(m[1].trim(), '..', '..', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'));
  return guesses.map((g) => path.normalize(g)).find((g) => fs.existsSync(g)) || null;
}

module.exports = { plan, windowsEntries, matchEntry, splitCommand, unsafeFolder, epicLauncher, folderSize };

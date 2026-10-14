// Finds games in any folder or whole drive by the evidence inside their folders:
// store files (Steam, Epic, GOG, Xbox), engine files (Unity, Unreal, Godot, GameMaker, RPG Maker, Ren'Py, Source),
// game middleware, and what each .exe says about itself (version info, windowed or console, imported DLLs).
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const pe = require('./pe');
const vdf = require('./vdf');

/* ---------- what to skip while walking ---------- */

const PRUNE = new Set([
  'windows', 'windows.old', '$recycle.bin', 'system volume information', 'recovery', 'perflogs', 'programdata', 'msocache', 'config.msi',
  '$windows.~bt', '$windows.~ws', '$winreagent', '$sysreset', 'onedrivetemp', 'intel', 'amd', 'nvidia', 'drivers', 'boot', 'efi',
  'appdata', 'application data', 'local settings', 'node_modules', '.git', '.svn', '.hg', '__pycache__', 'site-packages', '.vs', '.vscode',
  'common files', 'windowsapps', 'modifiablewindowsapps', 'windows defender', 'windows kits', 'windows nt', 'windows mail', 'windows media player',
  'windows photo viewer', 'windows portable devices', 'windows security', 'windows sidebar', 'windowspowershell', 'microsoft visual studio',
  'microsoft sdks', 'microsoft sql server', 'microsoft office', 'microsoft.net', 'reference assemblies', 'dotnet', 'nvidia corporation',
  'microsoft', 'internet explorer', 'packages', 'package cache', 'installer', 'installshield installation information', 'uninstall information',
  '_commonredist', 'commonredist', 'redist', 'redistributables', 'directx', 'dxsetup', 'vcredist', 'vc_redist', '__installer', 'installers',
  'prerequisites', '_prereqs', 'prereqs', 'dotnetfx', 'easyanticheat', 'easyanticheat_eos', 'battleye', 'crashreporter', 'crashpad', 'crashes',
  'logs', 'log', 'screenshots', 'shadercache', 'shader_cache', 'cache', 'caches', 'temp', 'tmp', 'downloading', 'workshop', 'compatdata',
  'engine', 'monobleedingedge', 'mono', 'jre', 'jdk', 'java', 'python', 'locales', 'swiftshader', 'savegames', 'saves', 'save', 'mods',
  'steamworks shared', 'steam controller configs', 'steamvr', 'proton', 'sources', 'source code', 'src',
]);
const prunable = (lower, parentLower) => PRUNE.has(lower) || /_data$/.test(lower) && parentLower !== 'steamapps'
  || (lower === 'common' && parentLower === 'program files') || (lower === 'shadercache' || lower === 'temp') && parentLower === 'steamapps';

/* ---------- what a single directory listing tells us ---------- */

const MIDDLEWARE = /^(fmod\w*|fmodex\w*|fmodstudio\w*|bink\w*|binkw\w*|openal32|physx\w*|physx3\w*|xinput\w*|xaudio2_\d+|mss(32|64)|d3dx9_\d+|d3dx10_\d+|d3dx11_\d+|sdl2|sdl3|aksoundengine\w*|amd_ags_x\d+|nvngx_dlss\w*|sl\.interposer|ffx_\w+|gfsdk_\w+|discord_game_sdk|galaxy(64)?|eossdk-win\d+-shipping|steam_api(64)?|xgameruntime\w*|gameinput\w*|criware\w*|cri_\w+|wwise\w*|havok\w*|granny2\w*|oo2core_\d+_win\d+|bugsplat\w*)\.dll$/;
const PACKS = /\.(pak|pck|vpk|bsa|ba2|forge|big|wad|arc|assets|bundle|cpk|rpf|bnk|wem|bik|bk2|usm|ucas|utoc|rpa|rgssad|rgss2a|rgss3a|pkg|dat\.\d+)$/;
const ELECTRON = new Set(['chrome_100_percent.pak', 'chrome_200_percent.pak', 'licenses.chromium.html', 'v8_context_snapshot.bin', 'snapshot_blob.bin']);

function readFlags(names, dirs) {
  const f = {};
  const has = (n) => names.has(n);
  const hasDir = (n) => dirs.has(n);
  if (has('unityplayer.dll') || [...dirs].some((d) => d.endsWith('_data') && names.has(d.slice(0, -5) + '.exe'))) f.unity = true;
  if (hasDir('engine') && (hasDir('binaries') || [...dirs].length < 12)) f.engineDir = true;
  if ([...names].some((n) => /-(win64|wingdk|win32)-shipping\.exe$/.test(n))) f.unreal = true;
  if ([...names].some((n) => n.endsWith('.pck')) && [...names].some((n) => n.endsWith('.exe'))) f.godot = true;
  if (has('data.win')) f.gamemaker = true;
  if ((has('nw.dll') || has('package.nw')) && (hasDir('www') || hasDir('js'))) f.rpgmaker = true;
  if (has('game.ini') && [...names].some((n) => /^rgss\d+\w*\.dll$|\.rgss\d?a$|\.rvproj2?$|^game\.rgss/.test(n))) f.rpgmaker = true;
  if (hasDir('renpy') && hasDir('game') && hasDir('lib')) f.renpy = true;
  if (has('gameinfo.txt') || has('hl2.exe')) f.source = true;
  if (has('steam_api.dll') || has('steam_api64.dll') || has('steam_appid.txt')) f.steamworks = true;
  if ([...names].some((n) => /^goggame-\d+\.info$/.test(n))) f.gog = true;
  if (hasDir('.egstore')) f.epic = true;
  if (has('microsoftgame.config')) f.xbox = true;
  let mw = 0, packs = 0, electron = 0;
  for (const n of names) {
    if (MIDDLEWARE.test(n)) mw++;
    else if (ELECTRON.has(n)) electron++;
    else if (PACKS.test(n)) packs++;
  }
  if (mw) f.middleware = mw;
  if (packs) f.packs = packs;
  if (electron >= 2 || (hasDir('resources') && has('ffmpeg.dll') && has('libegl.dll'))) f.electron = true;
  if (has('qt5core.dll') || has('qt6core.dll')) f.qt = true;
  return f;
}
const STRONG = ['unity', 'unreal', 'engineDir', 'godot', 'gamemaker', 'rpgmaker', 'renpy', 'source', 'steamworks', 'gog', 'epic', 'xbox'];
const LABEL = { gog: 'GOG game', epic: 'Epic Games game', xbox: 'Xbox game', steamworks: 'Steam game files', unity: 'Unity game', unreal: 'Unreal Engine game', engineDir: 'Unreal Engine game', godot: 'Godot game', gamemaker: 'GameMaker game', rpgmaker: 'RPG Maker game', renpy: 'Ren’Py game', source: 'Source engine game' };

/* ---------- what a single .exe name or version info tells us ---------- */

const JUNK = [
  [/^unins\d*$|uninst|^uninstall/, 'uninstaller'],
  [/setup|install|^dxsetup|vc_?redist|vcredist|directx|dotnet|^ndp\d|oalinst|physx|prereq|dxwebsetup|^ue\d?prereq/, 'installer or runtime'],
  [/crash|bugreport|reporter|errorreport|sentry|breakpad|bugsplat|crashpad/, 'crash tool'],
  [/easyanticheat|^eac|anticheat|vanguard|^beservice|battleye(?!.*launcher)/, 'anti-cheat'],
  [/updat|patcher|^autoupdate/, 'updater'],
  [/^(python\w*|pythonw|java\w*|javaw|node|cefsharp.*|zfgamebrowser|unitycrashhandler\w*|quicksfv|7z\w*|notepad\w*|dxdiag|regsvr\w*|cmd|powershell|conhost)$|helper|subprocess|webhelper|cefprocess|browser_?process|renderer|gpu_?process/, 'helper program'],
  [/^(cleanup|touchup|activation\w*|register|registration|eula|readme|manual|support|dowser|redistcheck|vcrt\w*|dotnet\w*|7zfm|7zg)$/, 'helper program'],
];
const STORE_APPS = /^(steam|steamwebhelper|epicgameslauncher|epicwebhelper|galaxyclient|galaxyclient helper|gog galaxy|eadesktop|ealauncher|origin|originwebhelperservice|upc|ubisoftconnect|ubisoftgamelauncher\w*|battle\.net|battle\.net launcher|blizzard\w*|riotclientservices|riotclientux\w*|xboxpcapp|xboxapp|amazon games|amazongamesui|itch|heroic|playnite\.\w+|launchbox|bigbox|rockstarservice|rockstar games launcher|launcherpatcher|bethesdanetlauncher|wargaminggamecenter|wgc)$/;
const EMULATORS = /^(retroarch|dolphin|pcsx2\w*|rpcs3|yuzu|ryujinx|cemu|citra\w*|duckstation\w*|ppsspp\w*|xemu|xenia\w*|snes9x\w*|mgba\w*|visualboyadvance\w*|vba\w*|project64|melonds|desmume\w*|mame\w*|epsxe\w*|bsnes\w*|higan|mesen\w*|fceux\w*|nestopia|redream|flycast|vita3k|shadps4\w*|suyu|sudachi|lime3ds\w*|azahar\w*|ares|no\$gba|bizhawk|emuhawk|dosbox\w*|scummvm)$/;
const NON_GAME_COMPANY = /microsoft corporation|nvidia corporation|intel corporation|advanced micro devices|realtek|python software foundation|oracle|google llc|google inc|mozilla|adobe|jetbrains|github|igor pavlov|the qt company|videolan|obs project|blender foundation|notepad\+\+|logitech|razer|corsair|steelseries|asus|msi|discord inc|spotify|zoom|dropbox|apple inc/i;
const JUNK_DESC = /(un)?install|setup|redistributable|crash|bug ?report|updater|patcher|anti-?cheat|\bservice\b|helper|elevat|prerequisite|web ?browser|subprocess/i;
const GENERIC_NAME = /^(game|games|bin|binaries|win64|win32|x64|x86|release|app|client|data|content|windowsnoeditor|pc|launcher|bootstrap(packagedgame)?|unity|unity player|unreal engine|ue4|ue5|ue4game|godot( engine)?|nw\.js|electron|renpy|ren'py|gamemaker\w*|rpg maker\w*|shipping|main|start|play|run|setup|program|application|player|engine|steam|new folder|desktop)$/i;
const INTERNAL = new Set(['bin', 'bin32', 'bin64', 'binaries', 'win32', 'win64', 'x64', 'x86', 'x86_64', 'amd64', 'release', 'retail', 'shipping', 'game', 'system', 'system32', 'exe', 'executable', 'runtime', 'app', 'build', 'windows', 'windowsnoeditor', 'wingdk', 'pc', 'content', 'win', 'base']);
const CONTAINER = /^(games?|my games|pc games|steamlibrary|steam library|common|steamapps|epic games|epic|gog games|gog galaxy|games\.gog|xboxgames|xbox games|origin games|ea games|ubisoft|ubisoft game launcher|riot games|program files( \(x86\))?|portable|portable games|apps|software|downloads|desktop)$/i;

function junkReason(base, ver) {
  for (const [re, why] of JUNK) if (re.test(base)) return why;
  if (ver && ver.FileDescription && JUNK_DESC.test(ver.FileDescription) && !/game/i.test(ver.FileDescription)) return 'helper program';
  return null;
}

/* ---------- helpers ---------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function similarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))) return 0.75;
  const ta = new Set(String(a).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const tb = String(b).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  return tb.length ? tb.filter((t) => ta.has(t)).length / Math.max(ta.size, tb.length) : 0;
}
function cleanName(s) {
  const out = String(s)
    .replace(/\.(exe|lnk|zip|7z|rar)$/i, '')
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, '')
    .replace(/[\s._-]+(v|ver|version|build)?[\s._]?\d+([._]\d+){1,3}[a-z]?(?=$|[\s._-])/gi, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\b(repack|gog|steam ?rip|portable|x64|x86|win64|win32|multi\d+|fitgirl|dodi|elamigos|codex|plaza|skidrow|empress|tenoke|rune|flt|razor1911|goldberg|update \d+)\b/gi, '')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || String(s);
}
async function readJson(file) { try { return JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^﻿/, '')); } catch { return null; } }
async function readText(file) { try { return await fsp.readFile(file, 'utf8'); } catch { return null; } }
const inside = (child, parent) => child.toLowerCase().startsWith(parent.toLowerCase().replace(/[\\/]+$/, '') + path.sep);
const sameOrInside = (child, parent) => child.toLowerCase() === parent.toLowerCase() || inside(child, parent);

/* ---------- store metadata found on disk ---------- */

async function gogInfo(dir) {
  let list = [];
  try { list = (await fsp.readdir(dir)).filter((n) => /^goggame-\d+\.info$/i.test(n)); } catch { return null; }
  for (const n of list) {
    const j = await readJson(path.join(dir, n));
    if (!j || !j.name) continue;
    if (j.rootGameId && j.gameId && j.rootGameId !== j.gameId) continue; // DLC
    const task = (j.playTasks || []).find((t) => t.isPrimary && t.type === 'FileTask') || (j.playTasks || []).find((t) => t.type === 'FileTask');
    return {
      name: j.name, id: String(j.gameId || n.match(/\d+/)[0]),
      exe: task && task.path ? path.join(dir, task.path) : '', args: (task && task.arguments) || '',
      cwd: task && task.workingDir ? path.join(dir, task.workingDir) : '',
    };
  }
  return null;
}
async function epicInfo(dir, epicByDir) {
  const known = epicByDir.get(dir.toLowerCase());
  if (known) return known;
  let list = [];
  try { list = (await fsp.readdir(path.join(dir, '.egstore'))).filter((n) => n.toLowerCase().endsWith('.mancpn')); } catch { return null; }
  for (const n of list) {
    const j = await readJson(path.join(dir, '.egstore', n));
    if (j && j.AppName && j.CatalogItemId && j.CatalogNamespace) {
      return { id: j.AppName, uri: `com.epicgames.launcher://apps/${encodeURIComponent(`${j.CatalogNamespace}:${j.CatalogItemId}:${j.AppName}`)}?action=launch&silent=true` };
    }
  }
  return null;
}
async function xboxInfo(dir) {
  const x = await readText(path.join(dir, 'MicrosoftGame.config'));
  if (!x) return null;
  const exe = /<Executable\s[^>]*Name="([^"]+)"/i.exec(x);
  const title = /DefaultDisplayName="([^"]+)"/i.exec(x) || /<Title>([^<]+)<\/Title>/i.exec(x);
  const id = /<Identity\s[^>]*Name="([^"]+)"/i.exec(x);
  const name = title && !/^ms-resource:/i.test(title[1]) ? title[1] : null;
  return { exe: exe ? path.join(dir, exe[1]) : '', name, id: id ? id[1] : null };
}
async function unityName(exePath) {
  const t = await readText(path.join(path.dirname(exePath), path.basename(exePath, path.extname(exePath)) + '_Data', 'app.info'));
  if (!t) return null;
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return lines[1] || null;
}
async function steamAppId(dir) {
  const t = await readText(path.join(dir, 'steam_appid.txt'));
  const m = t && /^\s*(\d{2,9})\s*$/m.exec(t);
  return m ? m[1] : null;
}

/* ---------- the scan ---------- */

/**
 * scan(root, { onProgress, signal, steamInstalled, epicByDir, notGames }) -> { root, dirs, candidates, stopped }
 * Each candidate is one game: { id, status, reason, name, source, sourceId, uri, exe, exes, installDir, args, cwd, steamAppId }.
 */
async function scan(root, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const signal = opts.signal || { stopped: false };
  const MAX_DEPTH = opts.maxDepth || 8, MAX_DIRS = opts.maxDirs || 400000, CONC = 8;
  root = path.resolve(root);
  const nodes = new Map(); // path -> { depth, flags, exes }
  const steamLibs = [];   // steamapps folders with manifests
  let dirs = 0, lastTick = 0;

  // walk, breadth first, a few folders at a time
  const queue = [{ p: root, depth: 0, parentLower: '' }];
  async function visit({ p, depth, parentLower }) {
    let items;
    try { items = await fsp.readdir(p, { withFileTypes: true }); } catch { return; }
    dirs++;
    const names = new Set(), dirNames = new Set(), exes = [];
    for (const e of items) {
      const lower = e.name.toLowerCase();
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        dirNames.add(lower);
        if (depth < MAX_DEPTH && !prunable(lower, path.basename(p).toLowerCase()) && !(depth === 0 && /^\$/.test(lower))) queue.push({ p: path.join(p, e.name), depth: depth + 1, parentLower: path.basename(p).toLowerCase() });
      } else if (e.isFile()) {
        names.add(lower);
        if (lower.endsWith('.exe')) exes.push({ name: e.name, path: path.join(p, e.name) });
      }
    }
    const flags = readFlags(names, dirNames);
    if (path.basename(p).toLowerCase() === 'steamapps' && [...names].some((n) => /^appmanifest_\d+\.acf$/.test(n))) steamLibs.push(p);
    for (const x of exes) { try { x.size = (await fsp.stat(x.path)).size; } catch { x.size = 0; } }
    if (exes.length || Object.keys(flags).length || dirNames.size) nodes.set(p, { depth, flags, exes, dirNames });
    const now = Date.now();
    if (now - lastTick > 150) { lastTick = now; onProgress({ phase: 'walk', dirs, at: p }); }
  }
  while (queue.length && !signal.stopped && dirs < MAX_DIRS) {
    const batch = queue.splice(0, CONC);
    await Promise.all(batch.map(visit));
  }
  const stopped = !!signal.stopped || dirs >= MAX_DIRS;

  // Steam libraries on this drive: their manifests name the games exactly
  const claimed = []; // { dir, steam: { id, name } }
  for (const lib of steamLibs) {
    let files = [];
    try { files = (await fsp.readdir(lib)).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      const st = vdf.get(vdf.parse((await readText(path.join(lib, f))) || ''), 'AppState');
      if (!st) continue;
      const id = String(vdf.get(st, 'appid') || ''), name = String(vdf.get(st, 'name') || '').trim(), dirName = String(vdf.get(st, 'installdir') || '');
      if (!id || !name || !dirName || (opts.notGames && opts.notGames(id, name))) continue;
      claimed.push({ dir: path.join(lib, 'common', dirName), steam: { id, name, installed: !!((Number(vdf.get(st, 'StateFlags')) || 0) & 4) } });
    }
  }

  // carry evidence up: a folder knows what its subfolders (three levels down) contain
  const agg = new Map();
  for (const [p, n] of nodes) {
    if (!Object.keys(n.flags).length) continue;
    let cur = p;
    for (let i = 0; i < 4 && sameOrInside(cur, root); i++) {
      const a = agg.get(cur) || {};
      for (const [k, v] of Object.entries(n.flags)) a[k] = typeof v === 'number' ? (a[k] || 0) + v : true;
      agg.set(cur, a);
      if (cur === root) break;
      cur = path.dirname(cur);
    }
  }

  // which folder is each program's game folder
  const rootOf = (exeDir) => {
    const lib = claimed.find((c) => sameOrInside(exeDir, c.dir));
    if (lib) return lib.dir;
    let cur = exeDir;
    for (let i = 0; i < 4 && sameOrInside(cur, root); i++) {
      const f = (nodes.get(cur) || {}).flags || {};
      if (f.gog || f.epic || f.xbox || f.renpy || f.engineDir) return cur;
      if (cur === root) break;
      cur = path.dirname(cur);
    }
    cur = exeDir;
    while (cur !== root && INTERNAL.has(path.basename(cur).toLowerCase()) && sameOrInside(path.dirname(cur), root)) cur = path.dirname(cur);
    if (cur !== root && ((nodes.get(path.dirname(cur)) || {}).flags || {}).engineDir) cur = path.dirname(cur);
    return cur;
  };
  const groups = new Map();
  for (const [p, n] of nodes) {
    for (const x of n.exes) {
      const r = rootOf(p);
      const g = groups.get(r) || { dir: r, exes: [] };
      g.exes.push({ ...x, depth: n.depth });
      groups.set(r, g);
    }
  }
  for (const c of claimed) if (!groups.has(c.dir) && fs.existsSync(c.dir)) groups.set(c.dir, { dir: c.dir, exes: [] });

  // a game folder inside another game folder (a tools folder, a second exe) belongs to the outer one,
  // unless the outer one is a library that holds several games
  const keys = [...groups.keys()].sort((a, b) => a.length - b.length);
  const strongAt = (k) => STRONG.some((f) => (agg.get(k) || {})[f]) || claimed.some((c) => c.dir === k);
  const below = (o) => keys.filter((k) => k !== o && inside(k, o));
  const isContainer = (o) => {
    const kids = below(o);
    if (CONTAINER.test(path.basename(o))) return true;
    if (kids.filter(strongAt).length >= 2) return true;
    if (kids.length >= 2 && !((nodes.get(o) || {}).exes || []).length) return true;
    if (o === root) return !STRONG.some((f) => ((nodes.get(o) || {}).flags || {})[f]);
    return false;
  };
  const containers = new Map(keys.map((k) => [k, isContainer(k)]));
  for (const k of [...keys].reverse()) {
    if (claimed.some((c) => c.dir === k)) continue;
    const outer = keys.filter((o) => o !== k && inside(k, o) && k.split(path.sep).length - o.split(path.sep).length <= 3 && !containers.get(o)).pop();
    if (outer && groups.has(k) && groups.has(outer)) {
      groups.get(outer).exes.push(...groups.get(k).exes);
      groups.delete(k);
    }
  }

  // judge each group
  onProgress({ phase: 'read', dirs, at: '' });
  const out = [];
  let n = 0;
  const work = [...groups.values()];
  async function judge(g) {
    if (signal.stopped && !stopped) return;
    const ev = agg.get(g.dir) || {};
    const claim = claimed.find((c) => c.dir === g.dir);
    const gog = ev.gog ? await gogInfo(g.dir) : null;
    const epic = ev.epic || (opts.epicByDir && opts.epicByDir.has(g.dir.toLowerCase())) ? await epicInfo(g.dir, opts.epicByDir || new Map()) : null;
    let xbox = null;
    if (ev.xbox) for (const p of [g.dir, path.join(g.dir, 'Content')]) { xbox = xbox || await xboxInfo(p); }

    // first pass on names alone, then read the best few programs
    const exes = [];
    for (const x of g.exes) {
      const base = path.basename(x.name, path.extname(x.name)).toLowerCase();
      const j = junkReason(base);
      x.base = base;
      x.store = STORE_APPS.test(base);
      x.emu = EMULATORS.test(base);
      if (!j) exes.push(x);
    }
    const pre = (x) => similarity(x.base, path.basename(g.dir)) * 25 - (x.depth - (nodes.get(g.dir) || { depth: 0 }).depth) * 5 + Math.min(x.size / 1048576, 100) * 0.08;
    exes.sort((a, b) => pre(b) - pre(a));
    const toRead = exes.slice(0, 6);
    await Promise.all(toRead.map(async (x) => { x.pe = await pe.info(x.path); }));

    const rootDepth = (nodes.get(g.dir) || { depth: 0 }).depth;
    const scored = [];
    let gfxImports = false, inputImports = false;
    for (const x of exes) {
      const info = x.pe;
      const ver = (info && info.version) || {};
      if (info && junkReason(x.base, ver)) continue;
      const imp = info ? info.imports : new Set();
      let s = pre(x);
      const gfx = ['d3d9.dll', 'd3d8.dll', 'd3d10.dll', 'd3d11.dll', 'd3d12.dll', 'dxgi.dll', 'opengl32.dll', 'vulkan-1.dll', 'ddraw.dll'].some((d) => imp.has(d));
      const inp = ['xinput1_3.dll', 'xinput1_4.dll', 'xinput9_1_0.dll', 'dinput8.dll', 'dinput.dll', 'gameinput.dll'].some((d) => imp.has(d));
      const steam = imp.has('steam_api64.dll') || imp.has('steam_api.dll');
      const engine = imp.has('unityplayer.dll') || [...imp].some((d) => /^(fmod|bink|sdl2|sdl3|openal32|physx|xaudio2_|mss32|mss64|eossdk|galaxy)/.test(d));
      if (gfx) { s += 20; gfxImports = true; }
      if (inp) { s += 10; inputImports = true; }
      if (steam) s += 30;
      if (engine) s += 15;
      if (info && info.gui) s += 5;
      if (info && info.console) s -= 30;
      const dirOf = path.dirname(x.path);
      const nd = nodes.get(dirOf) || { dirNames: new Set() };
      if (nd.dirNames.has(x.base + '_data')) s += 40;
      if (gog && gog.exe && gog.exe.toLowerCase() === x.path.toLowerCase()) s += 100;
      if (xbox && xbox.exe && xbox.exe.toLowerCase() === x.path.toLowerCase()) s += 100;
      if (/-(win64|wingdk|win32)-shipping$/.test(x.base)) s -= g.exes.some((o) => o.depth === rootDepth && !/-shipping$/.test(o.base)) ? 10 : 0;
      if (x.base === 'start_protected_game') s += 12;
      if (/editor|tool|config|setting|benchmark|server|dedicated|modkit|sdk|devkit|console$/.test(x.base)) s -= 15;
      if (/launcher/.test(x.base)) s -= 6;
      if (/-32$|x86$|32$/.test(x.base) && exes.some((o) => o !== x && o.base === x.base.replace(/-?(32|x86)$/, ''))) s -= 3;
      if (info && NON_GAME_COMPANY.test(ver.CompanyName || '')) s -= 12;
      if (x.store) s -= 60;
      if (x.emu) s -= 60;
      scored.push({ ...x, score: s, ver, gfx, inp });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // decide
    const strong = STRONG.find((k) => ev[k]) || (claim ? 'steamlib' : null);
    let status, reason;
    if (claim) {
      status = 'likely';
      reason = opts.steamInstalled ? 'Steam game' : 'Steam game, but Steam isn’t installed. Starts from its .exe';
    } else if (!best) {
      if (!g.exes.length) return;
      const firstJunk = g.exes.map((x) => junkReason(x.base)).find(Boolean);
      status = 'skipped';
      reason = g.exes.some((x) => x.store) ? 'Game store app' : `Only ${firstJunk || 'helper programs'}`;
    } else if (best.store) {
      status = 'skipped'; reason = 'Game store app';
    } else if (best.emu) {
      status = 'skipped'; reason = 'Emulator. Add it under Emulators';
    } else if (strong) {
      status = 'likely'; reason = LABEL[strong];
    } else if ((best.gfx && (best.inp || ev.middleware || ev.packs)) || (ev.middleware >= 2 && best.gfx)) {
      status = 'likely'; reason = 'Uses game graphics and controls';
    } else if (ev.electron || ev.qt || NON_GAME_COMPANY.test(best.ver.CompanyName || '')) {
      status = 'skipped'; reason = 'An app, not a game';
    } else if (best.gfx || ev.middleware || ev.packs >= 2 || inputImports) {
      status = 'unsure'; reason = 'Might be a game';
    } else if (CONTAINER.test(path.basename(path.dirname(g.dir))) && best.pe && best.pe.gui) {
      status = 'unsure'; reason = 'In a games folder, no other sign';
    } else {
      status = 'skipped'; reason = 'No sign of a game';
    }

    // name
    const unity = best ? await unityName(best.path) : null;
    const folder = cleanName(path.basename(g.dir));
    const prod = best && best.ver.ProductName && !GENERIC_NAME.test(best.ver.ProductName.trim()) && !/unreal|unity|epic games|bootstrap/i.test(best.ver.ProductName) ? best.ver.ProductName.trim() : null;
    const desc = best && best.ver.FileDescription && !GENERIC_NAME.test(best.ver.FileDescription.trim()) && !/unreal|unity|bootstrap|\.exe$/i.test(best.ver.FileDescription) ? best.ver.FileDescription.trim() : null;
    const folderOk = path.basename(g.dir) && !GENERIC_NAME.test(path.basename(g.dir)) && norm(folder).length > 3;
    const fromFolder = folderOk ? (prod && similarity(prod, folder) >= 0.5 ? prod : folder) : null;
    const name = (gog && gog.name) || (claim && claim.steam.name) || (xbox && xbox.name) || unity
      || fromFolder || prod || desc || (folderOk || !best ? folder : cleanName(best.name));

    const appid = ev.steamworks && best ? await steamAppId(path.dirname(best.path)) || await steamAppId(g.dir) : null;
    const cand = {
      id: `c${++n}`, status, reason, name: name.replace(/[™®©]/g, '').trim(),
      source: 'folder', sourceId: null, uri: '', exe: best ? best.path : '', installDir: g.dir,
      exes: scored.slice(0, 8).map((x) => ({ path: x.path, rel: path.relative(g.dir, x.path), size: x.size })),
      args: '', cwd: '', steamAppId: appid,
    };
    if (claim) {
      cand.steamAppId = claim.steam.id;
      if (opts.steamInstalled) Object.assign(cand, { source: 'steam', sourceId: claim.steam.id, uri: `steam://rungameid/${claim.steam.id}` });
    } else if (gog) {
      Object.assign(cand, { source: 'gog', sourceId: gog.id, exe: gog.exe && fs.existsSync(gog.exe) ? gog.exe : cand.exe, args: gog.args, cwd: gog.cwd });
    } else if (epic && epic.uri) {
      Object.assign(cand, { source: 'epic', sourceId: epic.id, uri: epic.uri, name: epic.name || cand.name });
    } else if (xbox && xbox.exe && fs.existsSync(xbox.exe)) {
      cand.exe = xbox.exe;
      cand.reason = 'Xbox game. If it doesn’t start, open it from the Xbox app';
    }
    if (!cand.exe && !cand.uri) return;
    out.push(cand);
  }
  for (let i = 0; i < work.length; i += 6) {
    await Promise.all(work.slice(i, i + 6).map((g) => judge(g)));
    onProgress({ phase: 'read', dirs, at: '', done: Math.min(i + 6, work.length), total: work.length });
  }

  const order = { likely: 0, unsure: 1, skipped: 2 };
  out.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { root, dirs, candidates: out, stopped };
}

module.exports = { scan, cleanName, similarity, readFlags, junkReason };

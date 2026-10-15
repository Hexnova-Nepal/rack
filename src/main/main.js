'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, protocol, net, Menu, nativeImage, Tray, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./store');
const scan = require('./scan');
const stores = require('./stores');
const { Covers } = require('./covers');
const launcher = require('./launch');
const detect = require('./detect');
const uninstaller = require('./uninstall');
const picker = require('./picker');
const winapi = require('./winapi');
const backups = require('./backups');
const { Pictures, SLOTS } = require('./wallpaper');
const pictures = new Pictures();
const { Updates } = require('./updates');

const APP_ID = 'app.rack.launcher';
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
/* The portable build keeps its data next to the .exe, so the library travels with it. */
if (PORTABLE) app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Rack Data'));

protocol.registerSchemesAsPrivileged([{ scheme: 'rack', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); return; }
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

let win = null, tray = null, store, covers, tracker, updates, ludusavi, steamRootPath = null;
let quitting = false, closedForPlay = false, pendingView = null;
let storeScan = {};                // source -> games, from the last full store scan
const folderResults = new Map();   // folder id -> candidates
const romResults = new Map();      // rom folder id -> games
const scanSignals = new Map();     // folder id -> { stopped }
const uninstalling = new Map();    // game id -> { timer, since }
let pickerOpen = null;
let ludusaviBusy = new Set();

const SOURCES = ['steam', 'epic', 'gog', 'ubisoft', 'ea', 'battlenet', 'xbox'];
const STORE_NAMES = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', battlenet: 'Battle.net', xbox: 'Xbox app' };
const SHADES = {
  dark: { graphite: ['#20252f', '#a5acba'], midnight: ['#141a2b', '#a3acc4'], black: ['#0e0e10', '#a1a1aa'], warm: ['#25211e', '#b5aca3'] },
  light: { cool: ['#e6e9ee', '#4a5262'], paper: ['#ebe6dc', '#5a5248'], white: ['#f1f2f4', '#4a5262'] },
};
const STATUSES = [['', 'No status'], ['playing', 'Playing'], ['backlog', 'Backlog'], ['completed', 'Completed'], ['dropped', 'Dropped']];

/* ---------- state ---------- */

function totalMinutes(g) {
  return g.source === 'steam' && store.data.settings.importSteamPlaytime ? Math.max(g.steamPlaytime || 0, g.playtime || 0) : g.playtime || 0;
}

function snapshot() {
  const d = store.data;
  return {
    games: d.games.map((g) => ({ ...g, total: totalMinutes(g), sessions: (g.sessions || []).slice(-120) })),
    collections: d.collections, folders: d.folders, romFolders: d.romFolders, settings: d.settings,
    running: tracker ? tracker.running().map((id) => ({ id, start: tracker.startedAt(id) })) : [],
    launching: tracker ? tracker.launching() : [], uninstalling: [...uninstalling.keys()],
    found: d.found, update: updates ? updates.state : null,
    ludusavi: { ready: !!(ludusavi && ludusavi.exe()), path: ludusavi && ludusavi.exe(), busy: [...ludusaviBusy] },
    saveBackupDir: saveDir(),
    app: { version: app.getVersion(), portable: PORTABLE, dataDir: app.getPath('userData'), windows: process.platform === 'win32', packaged: app.isPackaged, native: winapi.available(), nativeError: winapi.available() ? null : winapi.loadError },
  };
}

let pushTimer = null;
function push() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.send('state', snapshot());
    refreshTray();
  }, 60);
}
let jumpTimer = null;
const changed = () => {
  store.save(); push();
  clearTimeout(jumpTimer); jumpTimer = setTimeout(updateJumpList, 1500);
  if (tracker) tracker.refreshFolders();
};
/* ---------- wide game art for the wallpaper ---------- */

const heroQueue = [];
let heroBusy = false;
/** Fetches wide art for these games, one at a time, in the background. A miss is retried after a day. */
function wantHeroes(ids) {
  const now = Date.now();
  for (const id of ids || []) {
    const g = store.game(id);
    if (!g || g.hero || g.notInstalled || heroQueue.includes(id)) continue;
    if (g.heroTried && now - g.heroTried < 24 * 3600 * 1000) continue;
    heroQueue.push(id);
  }
  runHeroes();
}
async function runHeroes() {
  if (heroBusy) return;
  heroBusy = true;
  try {
    while (heroQueue.length) {
      const g = store.game(heroQueue.shift());
      if (!g || g.hero) continue;
      g.heroTried = Date.now();
      try {
        const f = await covers.hero(g, { key: store.data.settings.sgdbKey, steamRoot: steamRootPath, steamCachedHero: scan.steamCachedHero });
        if (f && store.game(g.id)) { g.hero = f; push(); }
      } catch { /* a bad key or no connection: the wallpaper uses the cover instead */ }
      await new Promise((r) => setTimeout(r, 350));
    }
  } finally { heroBusy = false; store.save(); }
}
/** When the wallpaper shows game art, fetch it for the games you play most and most recently. */
function fillHeroes() {
  const w = store.data.settings.wallpaper || {};
  if (w.source !== 'art' && w.source !== 'both' && !(w.follow && w.source !== 'off')) return;
  const games = store.data.games.filter((g) => !g.hidden && !g.notInstalled && !g.missing);
  games.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.playtime || 0) - (a.playtime || 0));
  wantHeroes(games.slice(0, 60).map((g) => g.id));
}

function toast(text, kind = '') {
  if (win && !win.isDestroyed()) win.webContents.send('toast', { text, kind });
  else notify(text);
}
function notify(body) {
  try { if (Notification.isSupported()) new Notification({ title: 'Rack', body, icon: iconPath() }).show(); } catch { /* no notifications */ }
}
const iconPath = () => path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const saveDir = () => (store && store.data.settings.saveBackupDir) || path.join(app.getPath('documents'), 'Rack save backups');

function checkMissing() {
  for (const g of store.data.games) {
    if (g.notInstalled) { g.missing = false; continue; }
    const target = g.source === 'emulator' ? g.rom : g.uri ? g.installDir : g.exe;
    g.missing = !!target && !/^shell:/i.test(target) && !exists(target);
  }
}

/* ---------- covers and store details, one at a time in the background ---------- */

const queue = [];
let queueBusy = false;
function enqueue(id, what) { if (!queue.some((q) => q.id === id && q.what === what)) queue.push({ id, what }); runQueue(); }
async function runQueue() {
  if (queueBusy) return;
  queueBusy = true;
  while (queue.length) {
    const { id, what } = queue.shift();
    const g = store.game(id);
    if (!g) continue;
    try {
      if (what === 'cover' && !g.cover) {
        const r = await covers.auto(g, { key: store.data.settings.sgdbKey, steamRoot: steamRootPath, steamCachedCover: scan.steamCachedCover });
        if (r && r.file) {
          g.cover = r.file;
          if (r.steamAppId && !g.steamAppId) { g.steamAppId = r.steamAppId; enqueue(g.id, 'details'); }
          changed();
        }
      } else if (what === 'details' && (g.source === 'steam' || g.steamAppId) && !g.detailsAt) {
        const d = await covers.steamDetails(g.source === 'steam' ? g.sourceId : g.steamAppId);
        g.detailsAt = Date.now();
        if (d) {
          if (!g.description && d.description) { g.description = d.description; g.descriptionFrom = 'steam'; }
          if (d.genres.length) g.genres = d.genres;
          if (d.year) g.year = d.year;
          if (d.developer) g.developer = d.developer;
        }
        changed();
        await new Promise((r) => setTimeout(r, 1500)); // the store asks apps not to ask too fast
      }
    } catch (e) {
      if (/API key/.test(e.message)) { toast(e.message, 'warn'); queue.length = 0; }
    }
  }
  queueBusy = false;
}
function fillMissingArt() {
  for (const g of store.data.games) {
    if (!g.cover) enqueue(g.id, 'cover');
    if ((g.source === 'steam' || g.steamAppId) && !g.detailsAt) enqueue(g.id, 'details');
  }
}

/* ---------- adding and removing ---------- */

/** Adds a game found by a scan or a store. Returns the stored game when it was new. */
async function addFound(g, { explicit = false } = {}) {
  if (!explicit && store.isIgnored(g)) return null;
  if (explicit) store.unignore(g);
  if (g.needsExe && !g.exe && !g.uri && g.installDir) {
    try {
      const r = await detect.scan(g.installDir, { maxDepth: 4 });
      const best = r.candidates.find((c) => c.status === 'likely') || r.candidates.find((c) => c.status === 'unsure');
      if (best) g.exe = best.exe;
    } catch { /* leave it without a launch file */ }
  }
  const r = store.addGame(g);
  if (r.added) {
    enqueue(r.game.id, 'cover');
    if (r.game.source === 'steam' || r.game.steamAppId) enqueue(r.game.id, 'details');
    return r.game;
  }
  // a game that was "not installed" and now is
  if (r.game.notInstalled && !g.notInstalled) { r.game.notInstalled = false; r.game.installDir = g.installDir || r.game.installDir; }
  return null;
}

function removeGame(id, { ignore = true } = {}) {
  const g = store.game(id);
  if (!g) return;
  if (ignore) store.ignore(g);
  covers.remove(g.cover);
  covers.remove(g.hero, store.heroDir);
  store.data.games = store.data.games.filter((x) => x.id !== id);
  if (store.data.settings.featuredId === id) store.data.settings.featuredId = null;
  changed();
}

function bulk(ids, patch) {
  const list = ids.map((id) => store.game(id)).filter(Boolean);
  if (patch.remove) { for (const g of list) removeGame(g.id); return; }
  for (const g of list) {
    if ('favourite' in patch) g.favourite = !!patch.favourite;
    if ('status' in patch) g.status = String(patch.status || '');
    if ('hidden' in patch) g.hidden = !!patch.hidden;
    if (patch.addCollection && !g.collections.includes(patch.addCollection)) g.collections.push(patch.addCollection);
    if (patch.removeCollection) g.collections = g.collections.filter((c) => c !== patch.removeCollection);
  }
  changed();
}

/* ---------- stores ---------- */

async function scanAllStores() {
  const on = store.data.settings.sources;
  const jobs = {
    steam: () => scan.scanSteam(), epic: () => scan.scanEpic(), gog: () => scan.scanGog(),
    ubisoft: () => stores.scanUbisoft(), ea: () => stores.scanEA(), battlenet: () => stores.scanBattleNet(), xbox: () => stores.scanXbox(),
  };
  const out = {};
  await Promise.all(SOURCES.map(async (s) => {
    if (on[s] === false) { out[s] = { installed: false, off: true, games: [] }; return; }
    try { out[s] = await jobs[s](); } catch { out[s] = { installed: false, games: [] }; }
  }));
  if (out.steam && out.steam.root) steamRootPath = out.steam.root;
  storeScan = Object.fromEntries(SOURCES.map((s) => [s, out[s].games]));
  return out;
}

function storeSummary(res) {
  const have = new Set(store.data.games.filter((g) => !g.notInstalled).map((g) => `${g.source}:${g.sourceId}`));
  return Object.fromEntries(SOURCES.map((s) => {
    const r = res[s] || { installed: false, games: [] };
    const fresh = r.games.filter((g) => !have.has(`${g.source}:${g.sourceId}`));
    return [s, { name: STORE_NAMES[s], installed: r.installed, off: !!r.off, total: r.games.length, fresh: fresh.length, names: fresh.slice(0, 40).map((g) => g.name) }];
  }));
}

async function refreshSteamHours() {
  if (!store.data.settings.importSteamPlaytime) return;
  try {
    const res = await scan.scanSteam();
    steamRootPath = res.root || steamRootPath;
    const byId = new Map(res.games.map((g) => [g.sourceId, g]));
    let any = false;
    for (const g of store.data.games) {
      const s = g.source === 'steam' && byId.get(g.sourceId);
      if (!s) continue;
      if (s.steamPlaytime > (g.steamPlaytime || 0)) { g.steamPlaytime = s.steamPlaytime; any = true; }
      if (s.steamLastPlayed && s.steamLastPlayed > (g.lastPlayed || 0)) { g.lastPlayed = s.steamLastPlayed; any = true; }
    }
    if (any) changed();
  } catch { /* Steam not installed or unreadable */ }
}

/** Steam games the account owns: hours for all of them, and not-installed ones in the library when asked for. */
async function refreshOwned({ quiet = true } = {}) {
  const s = store.data.settings;
  if (!s.steamApiKey) { if (!quiet) throw new Error('Add your Steam Web API key first'); return 0; }
  let steamId = s.steamId;
  if (!steamId) {
    const acc = stores.steamAccount(steamRootPath || (await scan.steamRoot().catch(() => null)) || '');
    if (acc) { steamId = acc.id; s.steamId = acc.id; }
  }
  const owned = await stores.steamOwned(async (u) => { const r = await net.fetch(u); if (r.status === 401 || r.status === 403) throw new Error('Steam rejected the API key'); if (!r.ok) throw new Error(`Steam answered ${r.status}`); return r.json(); }, s.steamApiKey, steamId);
  let added = 0;
  const byId = new Map(store.data.games.filter((g) => g.source === 'steam').map((g) => [g.sourceId, g]));
  for (const o of owned) {
    const g = byId.get(o.appid);
    if (g) {
      if (o.minutes > (g.steamPlaytime || 0)) g.steamPlaytime = o.minutes;
      if (o.lastPlayed && o.lastPlayed > (g.lastPlayed || 0)) g.lastPlayed = o.lastPlayed;
    } else if (s.showNotInstalled && !scan.steamNotGame(o.appid, o.name)) {
      const ng = await addFound({ source: 'steam', sourceId: o.appid, name: o.name, uri: `steam://rungameid/${o.appid}`, notInstalled: true, steamPlaytime: o.minutes, steamLastPlayed: o.lastPlayed });
      if (ng) added++;
    }
  }
  if (!s.showNotInstalled) store.data.games = store.data.games.filter((g) => !(g.notInstalled && g.source === 'steam'));
  s.ownedAt = Date.now();
  changed();
  return added;
}

/* ---------- finding new games on its own ---------- */

const folderKey = (c) => Store.keyOf({ source: c.source, sourceId: c.sourceId, exe: c.exe, installDir: c.installDir });

/** Change times of the folders where a new game would appear: the scan folder, its subfolders, and the folders that hold games. */
function folderMarks(root, candidates) {
  const dirs = new Set([root]);
  try { for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('$')) dirs.add(path.join(root, e.name)); } catch { /* unreachable */ }
  for (const c of candidates || []) if (c.installDir) dirs.add(path.dirname(c.installDir));
  const marks = {};
  for (const d of [...dirs].slice(0, 400)) { try { marks[d] = fs.statSync(d).mtimeMs; } catch { /* gone */ } }
  return marks;
}
const marksChanged = (a, b) => !a || Object.keys(b).length !== Object.keys(a).length || Object.entries(b).some(([k, v]) => a[k] !== v);

let finding = false;
async function findNew({ folders = true } = {}) {
  if (finding || !store.data.settings.autoFind) return;
  finding = true;
  try {
    const res = await scanAllStores();
    const addedNames = [];
    for (const s of SOURCES) {
      for (const g of res[s].games || []) {
        const key = Store.keyOf(g);
        const inLib = store.data.games.find((x) => Store.keyOf(x) === key);
        if (inLib) { if (inLib.notInstalled) { inLib.notInstalled = false; inLib.installDir = g.installDir; } continue; }
        if (store.isIgnored(g)) continue;
        if (store.data.settings.autoAddStore) { const ng = await addFound(g); if (ng) addedNames.push(ng.name); }
        else if (!store.data.found.some((f) => f.key === key)) store.data.found.push({ ...g, key, reason: `${STORE_NAMES[s]} game`, foundAt: Date.now() });
      }
    }
    // Steam games that left this PC
    if (res.steam && res.steam.installed) {
      const here = new Set(res.steam.games.map((g) => g.sourceId));
      for (const g of store.data.games) if (g.source === 'steam' && !g.notInstalled && !here.has(g.sourceId) && !exists(g.installDir)) {
        if (store.data.settings.showNotInstalled) g.notInstalled = true;
      }
    }
    if (folders) {
      for (const f of store.data.folders) {
        if (!exists(f.path)) continue;
        const now = folderMarks(f.path, folderResults.get(f.id));
        if (!marksChanged(f.marks, now)) continue;
        const r = await detect.scan(f.path, { steamInstalled: !!steamRootPath, notGames: scan.steamNotGame });
        f.marks = folderMarks(f.path, r.candidates);
        f.lastScan = Date.now();
        for (const c of r.candidates) {
          if (c.status !== 'likely') continue;
          const key = folderKey(c);
          const inLib = store.data.games.some((g) => Store.keyOf(g) === key || (g.exe && c.exe && g.exe.toLowerCase() === c.exe.toLowerCase()) || (g.installDir && c.installDir && g.installDir.toLowerCase() === c.installDir.toLowerCase()));
          if (inLib || store.data.ignored.includes(key) || store.data.found.some((x) => x.key === key)) continue;
          store.data.found.push({ ...c, key, from: f.path, foundAt: Date.now() });
        }
      }
    }
    checkMissing();
    changed();
    if (addedNames.length) toast(addedNames.length === 1 ? `Added ${addedNames[0]}` : `Added ${addedNames.length} new games: ${addedNames.slice(0, 3).join(', ')}${addedNames.length > 3 ? '…' : ''}`);
  } catch (e) { console.error('find new games', e); } finally { finding = false; }
}

let watchers = [];
function watchStores() {
  for (const w of watchers) try { w.close(); } catch { /* closed */ }
  watchers = [];
  let t = null;
  const soon = () => { clearTimeout(t); t = setTimeout(() => findNew({ folders: false }), 6000); };
  const dirs = new Set();
  if (steamRootPath) {
    dirs.add(path.join(steamRootPath, 'steamapps'));
    try {
      const lf = fs.readFileSync(path.join(steamRootPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of lf.matchAll(/"path"\s+"([^"]+)"/g)) dirs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
    } catch { /* no libraries file */ }
  }
  dirs.add(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
  for (const d of dirs) {
    if (!exists(d)) continue;
    try { watchers.push(fs.watch(d, (ev, file) => { if (!file || /\.(acf|item)$/i.test(file)) soon(); })); } catch { /* can't watch */ }
  }
}

/* ---------- playing ---------- */

async function playGame(id, actionId) {
  const g = store.game(id);
  if (!g) throw new Error('Game not found');
  if (uninstalling.has(id)) throw new Error(`${g.name} is being uninstalled`);
  const rf = g.source === 'emulator' ? store.data.romFolders.find((r) => r.id === g.romFolderId) : null;
  const action = actionId ? (g.actions || []).find((a) => a.id === actionId) : null;
  const p = launcher.plan(g, rf, action);
  await launcher.start(p, (u) => shell.openExternal(u));
  if (g.notInstalled) { toast(`Steam will install ${g.name}`); return; }
  g.lastPlayed = Date.now();
  tracker.watch(g, action ? action.exe : rf && rf.emulator);
  changed();
}

function onSessionStart(id, { external }) {
  const g = store.game(id);
  if (!g) return;
  g.lastPlayed = Date.now();
  if (!external) {
    let mode = store.data.settings.whilePlaying;
    if (mode === 'close' && !tray) mode = 'minimize'; // without a tray icon there would be no way back in
    if (mode === 'close' && win && !win.isDestroyed()) { closedForPlay = true; win.close(); }
    else if (mode === 'minimize' && win && !win.isDestroyed()) win.minimize();
  }
  changed();
}

function onSessionEnd(id, s) {
  const g = store.game(id);
  if (g) {
    g.playtime = (g.playtime || 0) + s.minutes;
    g.lastPlayed = Date.now();
    g.sessions = [...(g.sessions || []), { start: s.start, minutes: s.minutes, outside: !!s.external }].slice(-300);
    if (store.data.settings.backupAfterPlay && ludusavi.exe()) backupSaves(id, { quiet: true });
  }
  changed();
  if (closedForPlay && !tracker.running().length) {
    closedForPlay = false;
    showWindow();
    if (g && s.minutes >= 1) setTimeout(() => toast(`You played ${g.name} for ${s.minutes < 60 ? `${s.minutes} min` : `${Math.floor(s.minutes / 60)} h ${s.minutes % 60} min`}`), 1500);
  }
}

/* ---------- save backups ---------- */

async function backupSaves(id, { quiet = false } = {}) {
  const g = store.game(id);
  if (!g || ludusaviBusy.has(id)) return null;
  ludusaviBusy.add(id); push();
  try {
    const r = await ludusavi.backup(g, saveDir());
    g.lastSaveBackup = Date.now();
    if (!quiet) toast(`Backed up ${r.files} save ${r.files === 1 ? 'file' : 'files'} for ${g.name}`);
    else toast(`Saves backed up for ${g.name}`);
    return r;
  } catch (e) {
    if (!quiet) throw e;
    return null;
  } finally { ludusaviBusy.delete(id); changed(); }
}

/* ---------- uninstall: watch until the game's files are gone ---------- */

function watchUninstall(id, { minutes = 45 } = {}) {
  const g = store.game(id);
  if (!g) return;
  const target = g.source === 'emulator' ? g.rom : g.uri ? g.installDir : g.exe || g.installDir;
  const since = Date.now();
  clearInterval((uninstalling.get(id) || {}).timer);
  const timer = setInterval(() => {
    const gone = !target || !exists(target) || (g.exe && !g.uri && !exists(g.exe));
    if (gone) {
      clearInterval(timer); uninstalling.delete(id);
      removeGame(id);
      toast(`${g.name} was uninstalled and removed from Rack`);
    } else if (Date.now() - since > minutes * 60000) {
      clearInterval(timer); uninstalling.delete(id); push();
    }
  }, 4000);
  uninstalling.set(id, { timer, since });
  push();
}

/* ---------- shortcuts, taskbar list, tray ---------- */

const rackExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const launchArgs = (id) => (app.isPackaged ? '' : `"${app.getAppPath()}" `) + `--launch=${id}`;

async function iconFor(g) {
  if (g.exe && exists(g.exe)) return g.exe;
  if (g.iconExe && exists(g.iconExe)) return g.iconExe;
  if (g.source === 'emulator') { const rf = store.data.romFolders.find((r) => r.id === g.romFolderId); return rf && rf.emulator; }
  if (g.installDir && exists(g.installDir)) {
    try {
      const r = await detect.scan(g.installDir, { maxDepth: 4 });
      const best = r.candidates.find((c) => c.status === 'likely' || c.status === 'unsure');
      if (best && best.exe) { g.iconExe = best.exe; store.save(); return best.exe; }
    } catch { /* no icon */ }
  }
  return rackExe();
}

async function createShortcut(id) {
  const g = store.game(id);
  if (!g) throw new Error('Game not found');
  if (process.platform !== 'win32') throw new Error('Desktop shortcuts need Windows');
  const safe = g.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\.+$/, '').trim() || 'Game';
  const desk = app.getPath('desktop');
  let file = path.join(desk, `${safe}.lnk`);
  if (exists(file)) file = path.join(desk, `${safe} (Rack).lnk`);
  const ok = shell.writeShortcutLink(file, 'create', { target: rackExe(), args: launchArgs(g.id), description: `Play ${g.name} with Rack`, icon: await iconFor(g), iconIndex: 0 });
  if (!ok) throw new Error('Windows could not make the shortcut');
  return file;
}

function updateJumpList() {
  if (process.platform !== 'win32' || !store) return;
  const recent = store.data.games.filter((g) => g.lastPlayed && !g.hidden && !g.notInstalled && !g.missing)
    .sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 8);
  const items = recent.map((g) => ({
    type: 'task', title: g.name, program: rackExe(), args: launchArgs(g.id), description: `Play ${g.name}`,
    iconPath: (g.exe && exists(g.exe) && g.exe) || (g.iconExe && exists(g.iconExe) && g.iconExe) || rackExe(), iconIndex: 0,
  }));
  const tasks = [{ type: 'task', title: 'Scan for games', program: rackExe(), args: (app.isPackaged ? '' : `"${app.getAppPath()}" `) + '--open=scan', description: 'Open Rack’s scan screen', iconPath: rackExe(), iconIndex: 0 }];
  try { app.setJumpList([...(items.length ? [{ type: 'custom', name: 'Recently played', items }] : []), { type: 'tasks', items: tasks }]); } catch { /* not supported */ }
}

const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const running = tracker ? tracker.running() : [];
  const recent = store.data.games.filter((g) => g.lastPlayed && !g.hidden && !g.notInstalled && !g.missing && !running.includes(g.id))
    .sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 6);
  const tmpl = [];
  for (const id of running) {
    const g = store.game(id);
    if (!g) continue;
    tmpl.push({ label: `Playing ${g.name} · ${fmtMin(Math.round((Date.now() - tracker.startedAt(id)) / 60000))}`, enabled: false });
    tmpl.push({ label: `Stop timing ${g.name}`, click: () => tracker.stop(id) });
  }
  if (running.length) tmpl.push({ type: 'separator' });
  if (recent.length) {
    tmpl.push({ label: 'Play', enabled: false });
    for (const g of recent) tmpl.push({ label: g.name.length > 40 ? g.name.slice(0, 39) + '…' : g.name, click: () => playGame(g.id).catch((e) => notify(e.message)) });
    tmpl.push({ type: 'separator' });
  }
  tmpl.push({ label: 'Open Rack', click: () => showWindow() });
  tmpl.push({ label: 'Scan for games', click: () => showWindow('scan') });
  tmpl.push({ type: 'separator' });
  tmpl.push({ label: 'Quit Rack', click: () => { quitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(tmpl));
  const names = running.map((id) => (store.game(id) || {}).name).filter(Boolean);
  tray.setToolTip(names.length ? `Rack · Playing ${names.join(', ')}` : 'Rack');
}

function ensureTray() {
  const want = store.data.settings.keepInTray;
  if (!want && tray) { tray.destroy(); tray = null; return; }
  if (want && !tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath()));
    tray.on('click', () => showWindow());
    tray.on('double-click', () => showWindow());
    refreshTray();
  }
}

/* ---------- theme and window ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
function overlay() {
  const s = store.data.settings, dark = nativeTheme.shouldUseDarkColors, c = s.chrome;
  // the interface reports its title bar colours (themes); before it has, use the shade's
  if (c && HEX.test(c.color) && HEX.test(c.symbolColor)) return { color: c.color, symbolColor: c.symbolColor, height: 36 };
  const [color, symbolColor] = dark ? SHADES.dark[s.darkShade] || SHADES.dark.graphite : SHADES.light[s.lightShade] || SHADES.light.cool;
  return { color, symbolColor, height: 36 };
}
function applyTheme() {
  const s = store.data.settings;
  // a dark-only theme keeps Windows' own parts (menus, scroll bars, dialogs) dark too
  const want = s.chrome && s.chrome.forceDark ? 'dark' : s.theme || 'system';
  if (nativeTheme.themeSource !== want) nativeTheme.themeSource = want;
  if (win && !win.isDestroyed() && process.platform === 'win32') { try { win.setTitleBarOverlay(overlay()); } catch { /* older Windows */ } }
}

function createWindow({ view = null } = {}) {
  const b = store.data.settings.bounds || {};
  pendingView = view;
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 920, x: b.x, y: b.y, minWidth: 1080, minHeight: 680,
    title: 'Rack', show: false, icon: iconPath(),
    backgroundColor: overlay().color,
    titleBarStyle: 'hidden', titleBarOverlay: overlay(),
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  if (b.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { if (pendingView) { win.webContents.send('go', pendingView); pendingView = null; } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // text boxes get the usual Cut, Copy, Paste menu; games and collections bring their own
  win.webContents.on('context-menu', (_e, p) => {
    if (p.isEditable) Menu.buildFromTemplate([{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]).popup({ window: win });
    else if (p.selectionText && p.selectionText.trim()) Menu.buildFromTemplate([{ role: 'copy' }]).popup({ window: win });
  });
  win.on('close', () => {
    if (!win || win.isDestroyed()) return;
    store.data.settings.bounds = { ...(win.isMaximized() ? b : win.getNormalBounds()), maximized: win.isMaximized() };
    store.save();
    if (!quitting && store.data.settings.keepInTray && !store.data.settings.trayHintShown && !closedForPlay) {
      store.data.settings.trayHintShown = true;
      notify('Rack is still running in the tray, so it can time your games. Right-click its icon to quit.');
    }
  });
  win.on('closed', () => { win = null; });
}

function showWindow(view) {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    if (view) win.webContents.send('go', view);
    return;
  }
  createWindow({ view });
}

/* ---------- right-click menus ---------- */

function sendMenu(action, extra = {}) { if (win && !win.isDestroyed()) win.webContents.send('menu', { action, ...extra }); }

function gameMenu(ids) {
  const games = ids.map((id) => store.game(id)).filter(Boolean);
  if (!games.length || !win) return;
  const one = games.length === 1 ? games[0] : null;
  const t = [];
  const safe = (fn) => () => Promise.resolve().then(fn).catch((e) => toast(e.message, 'warn'));
  if (one) {
    if (tracker.running().includes(one.id)) t.push({ label: 'Stop timing', click: () => tracker.stop(one.id) });
    else if (one.notInstalled) t.push({ label: 'Install with Steam', click: safe(() => playGame(one.id)) });
    else t.push({ label: 'Play', enabled: !one.missing, click: safe(() => playGame(one.id)) });
    if ((one.actions || []).length && !one.notInstalled) t.push({ label: 'Start with', submenu: one.actions.map((a) => ({ label: a.name, click: safe(() => playGame(one.id, a.id)) })) });
    t.push({ label: 'Details', click: () => sendMenu('open', { ids }) });
    t.push({ type: 'separator' });
  } else t.push({ label: `${games.length} games selected`, enabled: false }, { type: 'separator' });
  const allFav = games.every((g) => g.favourite);
  t.push({ label: 'Favourite', type: 'checkbox', checked: allFav, click: () => bulk(ids, { favourite: !allFav }) });
  t.push({ label: 'Status', submenu: STATUSES.map(([v, l]) => ({ label: l, type: 'radio', checked: games.every((g) => (g.status || '') === v), click: () => bulk(ids, { status: v }) })) });
  const cols = store.data.collections.map((c) => {
    const all = games.every((g) => g.collections.includes(c.id));
    return { label: c.name, type: 'checkbox', checked: all, click: () => bulk(ids, all ? { removeCollection: c.id } : { addCollection: c.id }) };
  });
  const pins = Array.isArray(store.data.settings.rackPins) ? store.data.settings.rackPins : [];
  const canPin = games.every((g) => !g.hidden && !g.notInstalled);
  t.push({ label: 'Always on the rack', type: 'checkbox', enabled: canPin, checked: canPin && games.every((g) => pins.includes(g.id)), click: () => sendMenu('rackPin', { ids }) });
  t.push({ label: 'Add to collection', submenu: [...cols, ...(cols.length ? [{ type: 'separator' }] : []), { label: 'New collection…', click: () => sendMenu('newCollection', { ids }) }] });
  if (one) {
    const featured = store.data.settings.featuredId === one.id;
    t.push({ label: featured ? 'Stop featuring on Home' : 'Feature on Home', click: () => { store.data.settings.featuredId = featured ? null : one.id; changed(); } });
    t.push({ type: 'separator' });
    const dir = one.source === 'emulator' ? path.dirname(one.rom) : one.installDir || (one.exe && path.dirname(one.exe));
    t.push({ label: 'Open game folder', enabled: exists(dir), click: () => shell.openPath(dir) });
    t.push({ label: 'Create desktop shortcut', enabled: !one.notInstalled && process.platform === 'win32', click: safe(async () => { await createShortcut(one.id); toast(`Shortcut for ${one.name} is on your desktop`); }) });
    t.push({ label: 'Find a cover on Google…', click: () => openPicker(one.id) });
    if (ludusavi.exe()) t.push({ label: 'Back up saves now', click: safe(() => backupSaves(one.id)) });
  }
  t.push({ type: 'separator' });
  const allHidden = games.every((g) => g.hidden);
  t.push({ label: allHidden ? 'Show again' : 'Hide', click: () => bulk(ids, { hidden: !allHidden }) });
  if (one && !one.notInstalled) t.push({ label: 'Uninstall…', enabled: !one.missing, click: () => sendMenu('uninstall', { ids }) });
  // the Home desktop: put games on it or take them off
  if (store.data.settings.homeLayout === 'desktop') {
    const desk = Array.isArray(store.data.settings.desktop) ? store.data.settings.desktop : [];
    const all = games.every((g) => desk.some((x) => x && x.id === g.id));
    t.push({ label: all ? 'Remove from Home' : 'Put on Home', click: () => sendMenu(all ? 'deskRemove' : 'deskAdd', { ids }) });
  }
  t.push({ label: one ? 'Remove from library…' : `Remove ${games.length} games from library…`, click: () => sendMenu('remove', { ids }) });
  Menu.buildFromTemplate(t).popup({ window: win });
}

/* ---------- the cover picker ---------- */

function openPicker(id) {
  const g = store.game(id);
  if (!g) throw new Error('Game not found');
  if (pickerOpen && !pickerOpen.isDestroyed()) { pickerOpen.focus(); return; }
  if (!win) showWindow();
  const w = picker.open({
    parent: win, game: g,
    onPick: async (url, ses) => {
      try {
        const file = await covers.download(url, id, (u, o) => ses.fetch(u, o));
        const cur = store.game(id);
        if (!cur) return 'The game is no longer in your library';
        covers.remove(cur.cover); cur.cover = file; changed();
        toast(`New cover for ${cur.name}`);
        return true;
      } catch (e) { return e.message; }
    },
  });
  pickerOpen = w.win;
  w.win.on('closed', () => { pickerOpen = null; });
}

/* ---------- IPC ---------- */

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return await fn(...a); } catch (e) { return { error: e.message || String(e) }; }
});

const EDITABLE = ['name', 'exe', 'args', 'cwd', 'admin', 'description', 'favourite', 'collections', 'status', 'hidden'];

async function pick(kind, opts = {}) {
  const o = {
    folder: { properties: ['openDirectory'] },
    exe: { properties: ['openFile'], filters: [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd', 'lnk', 'url'] }, { name: 'All files', extensions: ['*'] }] },
    image: { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] },
    backup: { properties: ['openFile'], filters: [{ name: 'Rack library backup', extensions: ['rackbackup'] }] },
  }[kind];
  const r = await dialog.showOpenDialog(win, { ...o, ...opts });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
}

function registerIpc() {
  handle('state:get', () => snapshot());

  handle('game:update', (id, patch) => {
    const g = store.game(id);
    if (!g) throw new Error('Game not found');
    for (const k of EDITABLE) if (k in patch) g[k] = patch[k];
    if ('description' in patch) g.descriptionFrom = 'you';
    if ('exe' in patch && patch.exe && !g.uri) g.installDir = path.dirname(patch.exe);
    if (Array.isArray(patch.actions)) {
      g.actions = patch.actions.filter((a) => a && a.name && a.exe).slice(0, 12)
        .map((a) => ({ id: a.id || store.uid(), name: String(a.name).slice(0, 40), exe: String(a.exe), args: String(a.args || ''), cwd: String(a.cwd || ''), admin: !!a.admin }));
    }
    checkMissing();
    changed();
    return { ok: true };
  });
  handle('game:bulk', (ids, patch) => { bulk(ids || [], patch || {}); return { ok: true }; });
  handle('game:menu', (ids) => { gameMenu(ids || []); return { ok: true }; });
  handle('game:remove', (id) => { removeGame(id); return { ok: true }; });
  handle('game:feature', (id) => { store.data.settings.featuredId = id || null; changed(); return { ok: true }; });
  handle('game:play', async (id, actionId) => { await playGame(id, actionId); return { ok: true }; });
  handle('game:stopTiming', (id) => { tracker.stop(id); return { ok: true }; });
  handle('game:openFolder', (id) => {
    const g = store.game(id);
    const dir = g && (g.source === 'emulator' ? path.dirname(g.rom) : g.installDir || (g.exe && path.dirname(g.exe)));
    if (!exists(dir)) throw new Error('The game folder was not found');
    return shell.openPath(dir);
  });
  handle('game:shortcut', async (id) => ({ ok: true, file: await createShortcut(id) }));

  const uninstallCtx = (g) => ({
    otherGames: store.data.games.filter((x) => x.id !== g.id),
    scanFolders: store.data.folders.map((f) => f.path).concat(store.data.romFolders.map((r) => r.path)),
  });
  handle('game:uninstallPlan', async (id) => {
    const g = store.game(id);
    if (!g) throw new Error('Game not found');
    const p = await uninstaller.plan(g, uninstallCtx(g));
    return { method: p.method, title: p.title, detail: p.detail, warning: p.warning || null };
  });
  handle('game:uninstall', async (id) => {
    const g = store.game(id);
    if (!g) throw new Error('Game not found');
    if (tracker.running().includes(id)) throw new Error(`Close ${g.name} first`);
    const p = await uninstaller.plan(g, uninstallCtx(g)); // worked out again here, never taken from the page
    if (p.method === 'steam') { await shell.openExternal(p.uri); watchUninstall(id); }
    else if (p.method === 'epic') {
      const exe = await uninstaller.epicLauncher();
      if (exe) await winapi.open(exe); else await shell.openExternal('com.epicgames.launcher://store');
      watchUninstall(id);
    } else if (p.method === 'entry' || p.method === 'own') {
      const ok = await winapi.open(p.file, p.args, path.dirname(p.file));
      if (!ok && winapi.available()) throw new Error('The uninstaller did not start. Permission may have been refused.');
      watchUninstall(id);
    } else if (p.method === 'trash') {
      await shell.trashItem(p.dir);
      removeGame(id);
      return { ok: true, done: true, text: `${g.name} was moved to the Recycle Bin and removed from Rack` };
    } else if (p.method === 'rom') {
      if (exists(g.rom)) await shell.trashItem(g.rom);
      removeGame(id);
      return { ok: true, done: true, text: `${g.name} was moved to the Recycle Bin and removed from Rack` };
    } else throw new Error(p.detail);
    return { ok: true, done: false, text: p.method === 'epic' ? 'Uninstall it from your Library in the Epic Games Launcher' : `Finish uninstalling ${g.name} in the window that opened` };
  });
  handle('game:uninstallCancel', (id) => { clearInterval((uninstalling.get(id) || {}).timer); uninstalling.delete(id); push(); return { ok: true }; });

  handle('game:addManual', async () => {
    const file = await pick('exe');
    if (!file) return { ok: false };
    const game = await addFound({ source: 'manual', name: detect.cleanName(path.basename(file)), exe: file, installDir: path.dirname(file) }, { explicit: true });
    changed();
    const g = game || store.data.games.find((x) => (x.exe || '').toLowerCase() === file.toLowerCase());
    return { ok: true, id: g && g.id };
  });
  handle('game:locate', async (id) => {
    const g = store.game(id);
    const file = g && await pick('exe');
    if (!file) return { ok: false };
    g.exe = file; g.installDir = path.dirname(file); g.cwd = '';
    checkMissing(); changed();
    return { ok: true };
  });

  handle('game:coverMatches', (id) => covers.matches(store.game(id), store.data.settings.sgdbKey));
  handle('game:setCoverUrl', async (id, url) => {
    const g = store.game(id);
    if (!/^https:\/\//.test(url)) throw new Error('Bad link');
    const file = await covers.download(url, id);
    covers.remove(g.cover); g.cover = file; changed();
    return { ok: true };
  });
  handle('game:setCoverFile', async (id) => {
    const g = store.game(id);
    const file = await pick('image');
    if (!file) return { ok: false };
    const name = covers.copyFile(file, id);
    covers.remove(g.cover); g.cover = name; changed();
    return { ok: true };
  });
  handle('game:coverSearch', (id) => { openPicker(id); return { ok: true }; });
  handle('game:fetchCover', (id) => { const g = store.game(id); if (g) { covers.remove(g.cover); g.cover = null; enqueue(id, 'cover'); changed(); } return { ok: true }; });

  /* saves */
  handle('saves:preview', async (id) => {
    const g = store.game(id);
    if (!g) throw new Error('Game not found');
    return ludusavi.preview(g, saveDir());
  });
  handle('saves:backup', async (id) => backupSaves(id));
  handle('saves:restore', async (id) => {
    const g = store.game(id);
    if (!g) throw new Error('Game not found');
    if (tracker.running().includes(id)) throw new Error(`Close ${g.name} before restoring its saves`);
    ludusaviBusy.add(id); push();
    try { const r = await ludusavi.restore(g, saveDir()); toast(`Restored ${r.files} save ${r.files === 1 ? 'file' : 'files'} for ${g.name}`); return r; } finally { ludusaviBusy.delete(id); push(); }
  });
  handle('saves:openFolder', () => { fs.mkdirSync(saveDir(), { recursive: true }); return shell.openPath(saveDir()); });
  handle('ludusavi:download', async () => {
    const r = await ludusavi.download((p) => toast(p.text));
    changed();
    return { ok: true, version: r.version };
  });
  handle('ludusavi:pick', async () => {
    const f = await pick('exe', { title: 'Find ludusavi.exe' });
    if (!f) return { ok: false };
    if (!/ludusavi\.exe$/i.test(f)) throw new Error('Pick the file named ludusavi.exe');
    store.data.settings.ludusaviPath = f; changed();
    return { ok: true };
  });
  handle('saves:pickDir', async () => {
    const d = await pick('folder', { title: 'Where should save backups go?' });
    if (!d) return { ok: false };
    store.data.settings.saveBackupDir = d; changed();
    return { ok: true };
  });

  /* collections */
  handle('collection:create', (name, ids) => {
    const c = { id: store.uid(), name: String(name).trim().slice(0, 60) };
    if (!c.name) throw new Error('Give the collection a name');
    store.data.collections.push(c);
    if (Array.isArray(ids) && ids.length) bulk(ids, { addCollection: c.id }); else changed();
    return { ok: true, id: c.id };
  });
  handle('collection:rename', (id, name) => { const c = store.data.collections.find((x) => x.id === id); if (c && name.trim()) { c.name = name.trim().slice(0, 60); changed(); } return { ok: true }; });
  handle('collection:delete', (id) => {
    store.data.collections = store.data.collections.filter((c) => c.id !== id);
    for (const g of store.data.games) g.collections = (g.collections || []).filter((c) => c !== id);
    changed(); return { ok: true };
  });
  handle('collection:order', (id, ids) => {
    const c = store.data.collections.find((x) => x.id === id);
    if (!c || !Array.isArray(ids)) return { ok: false };
    c.order = ids.filter((x) => typeof x === 'string').slice(0, 20000);
    changed();
    return { ok: true };
  });
  handle('collection:menu', (id) => {
    const c = store.data.collections.find((x) => x.id === id);
    if (!c || !win) return { ok: false };
    const rows = Array.isArray(store.data.settings.homeRows) ? store.data.settings.homeRows : [];
    const onHome = rows.some((r) => r && r.id === 'col:' + id && r.on);
    Menu.buildFromTemplate([
      { label: 'Show on Home', type: 'checkbox', checked: onHome, click: () => sendMenu('rowToggle', { id: 'col:' + id }) },
      { type: 'separator' },
      { label: 'Rename', click: () => sendMenu('renameCollection', { id }) },
      { label: 'Delete collection', click: () => sendMenu('deleteCollection', { id }) },
    ]).popup({ window: win });
    return { ok: true };
  });

  handle('settings:set', async (patch) => {
    if (patch.fillArt) { delete patch.fillArt; fillMissingArt(); }
    const s = store.data.settings;
    Object.assign(s, patch);
    if ('theme' in patch || 'darkShade' in patch || 'lightShade' in patch) applyTheme();
    if ('startWithWindows' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.startWithWindows, path: rackExe(), args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
    if ('keepInTray' in patch) ensureTray();
    if ('sgdbKey' in patch && patch.sgdbKey) fillMissingArt();
    if ('importSteamPlaytime' in patch) refreshSteamHours();
    if ('trackOutside' in patch && tracker) tracker.begin();
    if ('showNotInstalled' in patch || 'steamApiKey' in patch) {
      try { const n = await refreshOwned({ quiet: !patch.steamApiKey && !patch.showNotInstalled }); if (n) toast(`Added ${n} Steam games you own but haven’t installed`); } catch (e) { toast(e.message, 'warn'); }
    }
    if ('autoFind' in patch && patch.autoFind) findNew();
    if ('wallpaper' in patch) fillHeroes();
    changed();
    return { ok: true };
  });
  handle('steam:owned', async () => ({ ok: true, added: await refreshOwned({ quiet: false }) }));
  /* wallpaper */
  handle('wall:list', () => pictures.list(store.data.settings.wallpaper));
  handle('wall:pick', async (slot) => {
    if (slot !== 'main' && !SLOTS.includes(slot)) return { ok: false };
    const dir = await pick('folder', { title: slot === 'main' ? 'Choose a folder of pictures' : `Choose pictures for the ${slot}` });
    if (!dir) return { ok: false };
    const w = store.data.settings.wallpaper;
    if (slot === 'main') { w.folder = dir; if (w.source === 'off') w.source = 'pictures'; else if (w.source === 'art') w.source = 'both'; } else w.times[slot] = dir;
    changed();
    return { ok: true, path: dir };
  });
  handle('wall:clear', (slot) => {
    const w = store.data.settings.wallpaper;
    if (slot === 'main') w.folder = ''; else if (SLOTS.includes(slot)) w.times[slot] = '';
    changed();
    return { ok: true };
  });
  handle('art:want', (ids) => { wantHeroes(Array.isArray(ids) ? ids.slice(0, 80) : []); return { ok: true }; });

  handle('appearance:chrome', (c) => {
    if (!c || !HEX.test(c.color) || !HEX.test(c.symbolColor)) return { ok: false };
    store.data.settings.chrome = { color: c.color, symbolColor: c.symbolColor, forceDark: !!c.forceDark };
    store.save();
    applyTheme();
    return { ok: true };
  });

  /* scanning */
  handle('scan:stores', async () => storeSummary(await scanAllStores()));
  handle('scan:folderAdd', async () => {
    const dir = await pick('folder');
    if (!dir) return { ok: false };
    if (!store.data.folders.some((f) => f.path.toLowerCase() === dir.toLowerCase())) store.data.folders.push({ id: store.uid(), path: dir });
    changed();
    return { ok: true, id: store.data.folders.find((f) => f.path.toLowerCase() === dir.toLowerCase()).id };
  });
  handle('scan:folderRemove', (id) => { store.data.folders = store.data.folders.filter((f) => f.id !== id); folderResults.delete(id); changed(); return { ok: true }; });
  handle('scan:folder', async (id) => {
    const f = store.data.folders.find((x) => x.id === id);
    if (!f) throw new Error('Folder not found');
    if (!exists(f.path)) throw new Error(`${f.path} is not reachable. Is the drive connected?`);
    const signal = { stopped: false };
    scanSignals.set(id, signal);
    const [steamRootNow, epic] = await Promise.all([scan.steamRoot().catch(() => null), scan.scanEpic().catch(() => ({ games: [] }))]);
    const epicByDir = new Map(epic.games.map((g) => [g.installDir.toLowerCase(), { id: g.sourceId, uri: g.uri, name: g.name }]));
    let res;
    try {
      res = await detect.scan(f.path, {
        signal, steamInstalled: !!steamRootNow, epicByDir, notGames: scan.steamNotGame,
        onProgress: (p) => win && !win.isDestroyed() && win.webContents.send('scan:progress', { id, ...p }),
      });
    } finally { scanSignals.delete(id); }
    const lib = store.data.games;
    const knownExe = new Set(lib.map((g) => (g.exe || '').toLowerCase()).filter(Boolean));
    const knownSrc = new Set(lib.filter((g) => g.sourceId && !g.notInstalled).map((g) => `${g.source}:${g.sourceId}`));
    const knownDir = lib.filter((g) => g.installDir).map((g) => g.installDir.toLowerCase());
    for (const c of res.candidates) {
      c.id = `${id}:${c.id}`;
      const exe = (c.exe || '').toLowerCase(), dir = (c.installDir || '').toLowerCase();
      if ((exe && knownExe.has(exe)) || (c.sourceId && knownSrc.has(`${c.source}:${c.sourceId}`)) || knownDir.some((d) => d === dir)) { c.status = 'have'; c.reason = 'Already in your library'; }
    }
    folderResults.set(id, res.candidates);
    f.lastScan = Date.now();
    f.marks = folderMarks(f.path, res.candidates);
    f.lastCounts = { likely: res.candidates.filter((c) => c.status === 'likely').length, unsure: res.candidates.filter((c) => c.status === 'unsure').length };
    changed();
    return { ok: true, dirs: res.dirs, stopped: res.stopped, candidates: res.candidates };
  });
  handle('scan:stop', (id) => { const s = scanSignals.get(id); if (s) s.stopped = true; return { ok: true }; });

  handle('scan:romSave', async (rf) => {
    if (!rf.path || !exists(rf.path)) throw new Error('Pick the folder that holds the ROM files');
    if (!rf.emulator || !exists(rf.emulator)) throw new Error('Pick the emulator program that opens them');
    const exts = String(rf.exts || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!exts.length) throw new Error('List the file types, for example .sfc, .smc');
    const entry = { id: rf.id || store.uid(), path: rf.path, emulator: rf.emulator, args: rf.args || '"{rom}"', exts, label: (rf.label || path.basename(rf.path)).slice(0, 12) };
    store.data.romFolders = store.data.romFolders.filter((x) => x.id !== entry.id).concat(entry);
    const games = await scan.scanRoms(entry);
    romResults.set(entry.id, games);
    entry.count = games.length;
    changed();
    return { ok: true, id: entry.id, count: games.length };
  });
  handle('scan:romRemove', (id) => { store.data.romFolders = store.data.romFolders.filter((r) => r.id !== id); romResults.delete(id); changed(); return { ok: true }; });

  handle('scan:add', async ({ stores: picked, picks }) => {
    let added = 0;
    const take = async (g) => { if (await addFound(g, { explicit: true })) added++; };
    if (!Object.keys(storeScan).length && picked && Object.values(picked).some(Boolean)) await scanAllStores();
    for (const s of SOURCES) if (picked && picked[s]) for (const g of storeScan[s] || []) await take(g);
    const all = [...folderResults.values()].flat();
    for (const pk of picks || []) {
      const c = all.find((x) => x.id === pk.id);
      if (!c) continue;
      const exe = pk.exe && c.exes.some((e) => e.path === pk.exe) ? pk.exe : c.exe;
      await take({ source: c.source, sourceId: c.sourceId, uri: c.uri, name: c.name, exe, args: exe === c.exe ? c.args : '', cwd: exe === c.exe ? c.cwd : '', installDir: c.installDir, steamAppId: c.steamAppId, otherExes: c.exes.map((e) => e.path).filter((p) => p !== exe) });
    }
    for (const rf of store.data.romFolders) for (const g of romResults.get(rf.id) || await scan.scanRoms(rf)) await take(g);
    store.data.found = store.data.found.filter((f) => !store.data.games.some((g) => Store.keyOf(g) === f.key));
    store.data.settings.setupDone = true;
    checkMissing();
    changed();
    return { ok: true, added };
  });

  /* games found in the background */
  handle('found:add', async (keys) => {
    let added = 0;
    for (const f of store.data.found.filter((x) => keys.includes(x.key))) {
      const ng = await addFound({ source: f.source, sourceId: f.sourceId, uri: f.uri, name: f.name, exe: f.exe, args: f.args, cwd: f.cwd, installDir: f.installDir, steamAppId: f.steamAppId, needsExe: f.needsExe, otherExes: (f.exes || []).map((e) => e.path).filter((p) => p !== f.exe) }, { explicit: true });
      if (ng) added++;
    }
    store.data.found = store.data.found.filter((x) => !keys.includes(x.key));
    checkMissing(); changed();
    return { ok: true, added };
  });
  handle('found:ignore', (keys) => {
    for (const k of keys) if (!store.data.ignored.includes(k)) store.data.ignored.push(k);
    store.data.found = store.data.found.filter((x) => !keys.includes(x.key));
    changed();
    return { ok: true };
  });
  handle('found:check', async () => { await findNew(); return { ok: true, found: store.data.found.length }; });

  /* library backup */
  handle('library:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Save a backup of your Rack library', defaultPath: path.join(app.getPath('documents'), `Rack library ${new Date().toISOString().slice(0, 10)}.rackbackup`), filters: [{ name: 'Rack library backup', extensions: ['rackbackup'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    store.save(true);
    const out = backups.exportLibrary(app.getPath('userData'), r.filePath);
    return { ok: true, file: r.filePath, covers: out.covers };
  });
  handle('library:import', async () => {
    const file = await pick('backup', { title: 'Open a Rack library backup' });
    if (!file) return { ok: false };
    const { lib } = backups.readBackup(file);
    const c = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Replace my library', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Replace your library?', message: `Replace your library with the backup (${lib.games.length} games)?`, detail: 'Your current library is kept as library.before-import.json in Rack’s data folder.' });
    if (c.response !== 0) return { ok: false };
    const data = backups.importLibrary(app.getPath('userData'), file);
    store.data = { ...store.data, ...data, settings: { ...store.data.settings, ...(data.settings || {}), bounds: store.data.settings.bounds } };
    for (const g of store.data.games) { g.status = g.status || ''; g.hidden = !!g.hidden; g.actions = g.actions || []; g.genres = g.genres || []; }
    store.data.found = store.data.found || []; store.data.ignored = store.data.ignored || [];
    checkMissing(); store.save(true); applyTheme(); changed();
    return { ok: true, games: store.data.games.length };
  });

  /* updates */
  handle('updates:check', async () => { await updates.check(); return { ok: true }; });
  handle('updates:install', () => { quitting = true; updates.install(); return { ok: true }; });

  handle('pick', (kind) => pick(kind));
  handle('app:openData', () => shell.openPath(app.getPath('userData')));
  handle('app:openUrl', (url) => {
    if (!/^https:\/\/((www\.)?steamgriddb\.com|steamcommunity\.com\/dev\/apikey|github\.com\/(Hexnova-Nepal\/rack|mtkennerly\/ludusavi))(\/|$)/.test(url)) throw new Error('Not allowed');
    return shell.openExternal(url);
  });
  handle('app:quit', () => { quitting = true; app.quit(); return { ok: true }; });
}

/* ---------- start ---------- */

function argValue(argv, name) {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
function handleArgs(argv) {
  const id = argValue(argv, 'launch');
  if (id) { playGame(id).catch((e) => toast(e.message, 'warn')); return true; }
  const view = argValue(argv, 'open');
  if (view) { showWindow(view); return true; }
  return false;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  store = new Store(app.getPath('userData'));
  covers = new Covers({
    fetch: (u, o) => net.fetch(u, o), coverDir: store.coverDir, heroDir: store.heroDir,
    imageSize: (buf) => { try { const i = nativeImage.createFromBuffer(buf); return i.isEmpty() ? null : i.getSize(); } catch { return null; } },
  });
  ludusavi = new backups.Ludusavi({ toolsDir: path.join(app.getPath('userData'), 'tools'), fetch: (u, o) => net.fetch(u, o), getPath: () => store.data.settings.ludusaviPath });
  tracker = new launcher.Tracker({
    games: () => store.data.games,
    background: () => store.data.settings.trackOutside && (store.data.settings.keepInTray || !!win),
    onStart: onSessionStart,
    onEnd: onSessionEnd,
    onGiveUp: () => push(),
  });
  updates = new Updates({ app, portable: PORTABLE, fetch: (u, o) => net.fetch(u, o), onChange: () => push() });

  // rack://cover/<file> and rack://hero/<file> serve Rack's own pictures; rack://wall/<id> serves
  // only pictures Rack listed from your wallpaper folders
  protocol.handle('rack', (req) => {
    const u = new URL(req.url);
    const name = path.basename(decodeURIComponent(u.pathname));
    if (u.host === 'cover' || u.host === 'hero') return net.fetch(pathToFileURL(path.join(u.host === 'cover' ? store.coverDir : store.heroDir, name)).toString());
    if (u.host === 'wall') {
      const f = pictures.file(name);
      return f ? net.fetch(pathToFileURL(f).toString()) : new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  });

  applyTheme();
  nativeTheme.on('updated', () => { applyTheme(); if (win) win.webContents.send('theme'); });
  registerIpc();
  checkMissing();
  ensureTray();
  const argv = process.argv.slice(1);
  const launched = handleArgs(argv);
  if (!launched && !argv.includes('--hidden')) createWindow();
  tracker.begin();
  updates.start();
  updateJumpList();
  steamRootPath = await scan.steamRoot().catch(() => null);
  watchStores();
  refreshSteamHours().then(fillMissingArt);
  setTimeout(fillHeroes, 8000);
  if (store.data.settings.steamApiKey && Date.now() - (store.data.settings.ownedAt || 0) > 12 * 3600 * 1000) refreshOwned().catch(() => {});
  setTimeout(() => { if (store.data.settings.setupDone) findNew(); }, 15000);
  setInterval(() => findNew(), 30 * 60000);
});

app.on('second-instance', (_e, argv) => { if (!handleArgs(argv.slice(1))) showWindow(); });
app.on('before-quit', () => {
  quitting = true;
  // a game still running when Rack closes keeps the time seen so far
  if (tracker && store) for (const s of tracker.flush()) {
    const g = store.game(s.id);
    if (g) { g.playtime = (g.playtime || 0) + s.minutes; g.sessions = [...(g.sessions || []), { start: s.start, minutes: s.minutes }].slice(-300); }
  }
  if (store) store.save(true);
});
app.on('window-all-closed', () => {
  // stay in the tray to keep timing games; quit only when asked to
  if (quitting) return;
  if (store && (store.data.settings.keepInTray || closedForPlay || (tracker && tracker.running().length))) return;
  app.quit();
});

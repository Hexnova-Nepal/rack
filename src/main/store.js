// The library and settings, kept as one JSON file in the app's data folder.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT = {
  version: 2,
  games: [],
  collections: [],
  folders: [],      // folders the user scans: [{ id, path, lastScan, marks }]
  romFolders: [],   // [{ id, path, emulator, args, exts: [], label }]
  ignored: [],      // games the user removed or dismissed, so automatic finding doesn't bring them back: ['steam:620', 'exe:d:\\games\\x\\x.exe']
  found: [],        // new games found in the background, waiting for review
  settings: {
    theme: 'system',            // system | light | dark
    themeId: 'rack',            // a ready-made theme: rack | nord | dracula | gruvbox | catppuccin | solarized | synthwave | forest
    chrome: null,               // title bar colours the interface reported, so the window opens in them
    accent: 'mono',             // theme (the theme's own) | mono | amber | lime | teal | sky | violet | rose | custom
    accentCustom: '#7c9cff',
    darkShade: 'graphite',      // graphite | midnight | black | warm
    lightShade: 'cool',         // cool | paper | white
    font: 'rack',               // theme (the theme's own) | rack | clean | arcade | scifi | classic
    coverSize: 'm',             // s | m | l
    view: 'covers',             // covers | list
    sgdbKey: '',
    startWithWindows: false,
    keepInTray: true,
    trackOutside: true,
    whilePlaying: 'close',      // close | minimize | nothing
    importSteamPlaytime: true,
    autoFind: true,
    autoAddStore: true,
    steamApiKey: '',
    steamId: '',
    showNotInstalled: false,
    ludusaviPath: '',
    saveBackupDir: '',
    backupAfterPlay: false,
    sources: { steam: true, epic: true, gog: true, ubisoft: true, ea: true, battlenet: true, xbox: true },
    featuredId: null,
    sort: 'lastPlayed',
    setupDone: false,
    trayHintShown: false,
    // the picture behind the app's screens
    wallpaper: {
      source: 'off',            // off | pictures | art | both
      folder: '',               // your pictures
      every: 15,                // minutes between pictures; 0 keeps one
      byTime: false,            // different pictures for each part of the day
      times: { morning: '', day: '', evening: '', night: '' },
      follow: true,             // on Home and a game's page, show that game's artwork
      dim: 60,                  // 0-90 %
      blur: 8,                  // 0-30 px
      where: 'all',             // all | home
    },
    order: [],                  // "Your order" of games, by id
    homeLayout: 'shelves',      // shelves | desktop
    homeRows: null,             // [{ id, on }]; null is the default set
    desktop: null,              // games placed on the Home desktop: [{ id, c, r }] grid cells; null until you place one
  },
};

const uid = () => crypto.randomBytes(6).toString('hex');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'library.json');
    this.coverDir = path.join(dir, 'covers');
    this.heroDir = path.join(dir, 'heroes'); // wide game art for the wallpaper
    fs.mkdirSync(this.coverDir, { recursive: true });
    fs.mkdirSync(this.heroDir, { recursive: true });
    this.data = this.load();
    this.timer = null;
  }

  load() {
    const fresh = JSON.parse(JSON.stringify(DEFAULT));
    for (const f of [this.file, this.file + '.bak']) {
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        const ds = d.settings || {}, dw = ds.wallpaper || {};
        const out = {
          ...fresh, ...d,
          settings: {
            ...fresh.settings, ...ds,
            sources: { ...fresh.settings.sources, ...(ds.sources || {}) },
            wallpaper: { ...fresh.settings.wallpaper, ...dw, times: { ...fresh.settings.wallpaper.times, ...(dw.times || {}) } },
          },
        };
        // an existing library has been set up already
        if (d.settings && d.settings.setupDone === undefined && ((d.games || []).length || (d.folders || []).length || (d.romFolders || []).length)) out.settings.setupDone = true;
        for (const g of out.games) {
          g.status = g.status || ''; g.hidden = !!g.hidden; g.actions = g.actions || []; g.genres = g.genres || [];
        }
        return out;
      } catch { /* try the backup, then start fresh */ }
    }
    return fresh;
  }

  /** Writes soon, not on every change; a temp file and a rename keep a crash from leaving half a library. */
  save(now = false) {
    clearTimeout(this.timer);
    const write = () => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(tmp, this.file);
    };
    if (now) write(); else this.timer = setTimeout(write, 400);
  }

  game(id) { return this.data.games.find((g) => g.id === id); }

  /** The key automatic finding uses to recognise a game. */
  static keyOf(g) {
    if (g.source && g.sourceId && g.source !== 'folder' && g.source !== 'manual') return `${g.source}:${g.sourceId}`.toLowerCase();
    if (g.rom) return `rom:${g.rom}`.toLowerCase();
    return `exe:${g.exe || g.installDir || ''}`.toLowerCase();
  }
  isIgnored(g) { return this.data.ignored.includes(Store.keyOf(g)); }
  ignore(g) { const k = Store.keyOf(g); if (!this.data.ignored.includes(k)) this.data.ignored.push(k); }
  unignore(g) { const k = Store.keyOf(g); this.data.ignored = this.data.ignored.filter((x) => x !== k); }

  /** Adds a game unless the same one is already here; returns the stored game. */
  addGame(g) {
    const same = this.data.games.find((x) =>
      (g.source && g.sourceId && x.source === g.source && x.sourceId === g.sourceId) ||
      (!g.uri && g.exe && x.exe && x.exe.toLowerCase() === g.exe.toLowerCase() && !g.rom));
    if (same) return { game: same, added: false };
    const game = {
      id: uid(), name: g.name, source: g.source || 'manual', sourceId: g.sourceId || null,
      exe: g.exe || '', args: g.args || '', cwd: g.cwd || '', admin: false, uri: g.uri || '',
      installDir: g.installDir || (g.exe ? path.dirname(g.exe) : ''), rom: g.rom || '', romFolderId: g.romFolderId || null,
      platform: g.platform || '', cover: null, description: '', favourite: false, collections: [],
      playtime: 0, steamPlaytime: g.steamPlaytime || 0, lastPlayed: g.steamLastPlayed || null,
      added: Date.now(), sessions: [], missing: false, steamAppId: g.steamAppId || null,
      status: '', hidden: false, actions: [], genres: [], year: null, developer: '', notInstalled: !!g.notInstalled,
      otherExes: g.otherExes || [], iconExe: g.iconExe || '',
    };
    this.data.games.push(game);
    return { game, added: true };
  }

  uid() { return uid(); }
}

module.exports = { Store, DEFAULT };

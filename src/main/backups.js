// Save backups through Ludusavi (github.com/mtkennerly/ludusavi, MIT), and Rack's own library backup file.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const fflate = require('fflate');

/* ---------- Ludusavi ---------- */

function run(exe, args, timeout = 10 * 60000) {
  return new Promise((resolve) => {
    execFile(exe, args, { encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      let json = null;
      const out = String(stdout || '').trim();
      if (out) { try { json = JSON.parse(out); } catch { json = null; } }
      resolve({ ok: !err, code: err && err.code, json, stderr: String(stderr || '').trim(), stdout: out });
    });
  });
}

class Ludusavi {
  constructor({ toolsDir, fetch, getPath }) {
    this.toolsDir = toolsDir;
    this.fetch = fetch;
    this.getPath = getPath; // () => the path the user set, if any
  }

  /** Where ludusavi.exe is, or null. Looks at the user's choice, Rack's own copy, then common install places. */
  exe() {
    const home = process.env.USERPROFILE || '';
    const local = process.env.LOCALAPPDATA || '';
    const list = [
      this.getPath(), path.join(this.toolsDir, 'ludusavi.exe'),
      path.join(local, 'Programs', 'ludusavi', 'ludusavi.exe'),
      path.join(home, 'scoop', 'apps', 'ludusavi', 'current', 'ludusavi.exe'),
      path.join(local, 'Microsoft', 'WinGet', 'Links', 'ludusavi.exe'),
    ];
    return list.find((p) => p && fs.existsSync(p)) || null;
  }

  /** Downloads the latest Windows release from GitHub into Rack's tools folder. */
  async download(onProgress = () => {}) {
    const res = await this.fetch('https://api.github.com/repos/mtkennerly/ludusavi/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Rack' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again later.`);
    const rel = await res.json();
    const asset = (rel.assets || []).find((a) => /win64\.zip$/i.test(a.name)) || (rel.assets || []).find((a) => /win.*\.zip$/i.test(a.name));
    if (!asset) throw new Error('No Windows download found in the latest Ludusavi release');
    onProgress({ text: `Downloading Ludusavi ${rel.tag_name} (${Math.round(asset.size / 1048576)} MB)…` });
    const zr = await this.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Rack' } });
    if (!zr.ok) throw new Error(`Download failed (${zr.status})`);
    const zip = new Uint8Array(await zr.arrayBuffer());
    const files = fflate.unzipSync(zip, { filter: (f) => /(^|\/)ludusavi\.exe$/i.test(f.name) });
    const name = Object.keys(files)[0];
    if (!name) throw new Error('The download did not contain ludusavi.exe');
    await fsp.mkdir(this.toolsDir, { recursive: true });
    const dest = path.join(this.toolsDir, 'ludusavi.exe');
    await fsp.writeFile(dest + '.tmp', files[name]);
    await fsp.rename(dest + '.tmp', dest);
    return { path: dest, version: rel.tag_name };
  }

  /** Ludusavi's title for a game: by Steam id, GOG id, exact name, then a looser match. */
  async title(game) {
    const exe = this.exe();
    if (!exe) throw new Error('Ludusavi is not set up. Set it up in Settings > Save backups.');
    const steam = (game.source === 'steam' && game.sourceId) || game.steamAppId;
    const tries = [];
    if (steam) tries.push(['find', '--api', '--steam-id', String(steam)]);
    if (game.source === 'gog' && game.sourceId) tries.push(['find', '--api', '--gog-id', String(game.sourceId)]);
    tries.push(['find', '--api', game.name]);
    tries.push(['find', '--api', '--normalized', game.name]);
    for (const args of tries) {
      const r = await run(exe, args, 120000);
      const names = r.json && r.json.games ? Object.keys(r.json.games) : [];
      if (names.length) return names[0];
    }
    return null;
  }

  async preview(game, backupDir) {
    const title = await this.title(game);
    if (!title) return { found: false, title: null };
    const exe = this.exe();
    const r = await run(exe, ['backup', '--preview', '--api', '--path', backupDir, title]);
    const g = r.json && r.json.games && r.json.games[title];
    const files = g && g.files ? Object.entries(g.files) : [];
    const bytes = files.reduce((n, [, f]) => n + (f.bytes || 0), 0);
    const last = await this.lastBackup(title, backupDir);
    return { found: true, title, files: files.length, bytes, last };
  }

  async lastBackup(title, backupDir) {
    const r = await run(this.exe(), ['backups', '--api', '--path', backupDir, title], 120000);
    const g = r.json && r.json.games && r.json.games[title];
    const list = (g && g.backups) || [];
    const times = list.map((b) => Date.parse(b.when)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }

  async backup(game, backupDir) {
    const title = await this.title(game);
    if (!title) throw new Error(`Ludusavi doesn’t know where ${game.name} keeps its saves`);
    await fsp.mkdir(backupDir, { recursive: true });
    const r = await run(this.exe(), ['backup', '--force', '--api', '--path', backupDir, title]);
    const o = r.json && r.json.overall;
    if (!r.json) throw new Error(r.stderr.split('\n').pop() || 'Ludusavi could not back up the saves');
    const g = r.json.games && r.json.games[title];
    if (!g || !Object.keys(g.files || {}).length) throw new Error(`No saves found for ${game.name} on this PC`);
    return { title, files: Object.keys(g.files).length, bytes: o ? o.processedBytes : 0 };
  }

  async restore(game, backupDir) {
    const title = await this.title(game);
    if (!title) throw new Error(`Ludusavi doesn’t know ${game.name}`);
    const r = await run(this.exe(), ['restore', '--force', '--api', '--path', backupDir, title]);
    if (!r.json) throw new Error(r.stderr.split('\n').pop() || 'Ludusavi could not restore the saves');
    const g = r.json.games && r.json.games[title];
    if (!g) throw new Error(`There is no backup of ${game.name} in ${backupDir}`);
    return { title, files: Object.keys(g.files || {}).length };
  }
}

/* ---------- Rack's own library backup (.rackbackup is a zip) ---------- */

function exportLibrary(dataDir, file) {
  const entries = { 'library.json': fs.readFileSync(path.join(dataDir, 'library.json')) };
  const coverDir = path.join(dataDir, 'covers');
  for (const n of fs.existsSync(coverDir) ? fs.readdirSync(coverDir) : []) {
    const p = path.join(coverDir, n);
    if (fs.statSync(p).isFile()) entries[`covers/${n}`] = [fs.readFileSync(p), { level: 0 }];
  }
  entries['rack-backup.json'] = Buffer.from(JSON.stringify({ app: 'Rack', made: new Date().toISOString(), format: 1 }));
  fs.writeFileSync(file, fflate.zipSync(entries, { level: 6 }));
  return { covers: Object.keys(entries).filter((k) => k.startsWith('covers/')).length };
}

/** Checks a backup file and returns what's in it, without changing anything. */
function readBackup(file) {
  const files = fflate.unzipSync(new Uint8Array(fs.readFileSync(file)));
  if (!files['rack-backup.json'] || !files['library.json']) throw new Error('That file is not a Rack library backup');
  const lib = JSON.parse(Buffer.from(files['library.json']).toString('utf8'));
  if (!Array.isArray(lib.games)) throw new Error('The backup has no library in it');
  return { files, lib };
}

/** Replaces the library and covers with the backup's. The current library is kept as library.before-import.json. */
function importLibrary(dataDir, file) {
  const { files, lib } = readBackup(file);
  const libFile = path.join(dataDir, 'library.json');
  if (fs.existsSync(libFile)) fs.copyFileSync(libFile, path.join(dataDir, 'library.before-import.json'));
  const coverDir = path.join(dataDir, 'covers');
  fs.mkdirSync(coverDir, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('covers/')) continue;
    const base = path.basename(name);
    if (!base || base.includes('..')) continue;
    fs.writeFileSync(path.join(coverDir, base), data);
  }
  return lib;
}

module.exports = { Ludusavi, exportLibrary, importLibrary, readBackup };

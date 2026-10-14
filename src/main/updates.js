// Updates. The installed version updates itself from GitHub Releases (electron-updater).
// The portable version can't replace itself while running, so it only says a new version exists.
'use strict';
const OWNER = 'Hexnova-Nepal', REPO = 'rack';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`;

const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// short, plain words for what went wrong; null means "nothing to tell the user"
function plain(e) {
  const m = String((e && e.message) || e || '');
  if (/\b404\b/.test(m)) return null; // no release published yet
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_CONNECTION/i.test(m)) return 'No internet connection. Rack will try again later.';
  if (/\b(403|429)\b|rate limit/i.test(m)) return 'GitHub is busy. Rack will try again later.';
  if (/sha512|checksum|signature/i.test(m)) return 'The download didn’t check out, so it wasn’t installed. Rack will try again later.';
  const first = m.split('\n')[0].replace(/^(Error:\s*)+/, '');
  return first.length > 140 ? first.slice(0, 137) + '…' : first;
}

class Updates {
  constructor({ app, portable, fetch, onChange }) {
    this.app = app;
    this.portable = portable;
    this.fetch = fetch;
    this.onChange = onChange;
    this.state = { status: 'idle', version: null, error: null, progress: 0, url: RELEASES };
    this.updater = null;
  }

  set(patch) { Object.assign(this.state, patch); this.onChange(this.state); }

  fail(e) {
    const msg = plain(e);
    this.set(msg ? { status: 'error', error: msg } : { status: 'current', error: null });
  }

  start() {
    if (!this.app.isPackaged) return;
    if (!this.portable) {
      try {
        const { autoUpdater } = require('electron-updater');
        this.updater = autoUpdater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
        autoUpdater.on('update-available', (i) => this.set({ status: 'downloading', version: i.version, progress: 0 }));
        autoUpdater.on('update-not-available', () => this.set({ status: 'current' }));
        autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent || 0) }));
        autoUpdater.on('update-downloaded', (i) => this.set({ status: 'ready', version: i.version, progress: 100 }));
        autoUpdater.on('error', (e) => this.fail(e));
      } catch (e) { this.fail(e); }
    }
    setTimeout(() => this.check(), 20000);
    this.timer = setInterval(() => this.check(), 6 * 3600 * 1000);
  }

  async check() {
    if (!this.app.isPackaged) { this.set({ status: 'dev' }); return; }
    if (this.updater) { try { await this.updater.checkForUpdates(); } catch (e) { this.fail(e); } return; }
    // portable: ask GitHub what the latest release is
    try {
      this.set({ status: 'checking', error: null });
      const res = await this.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Rack' } });
      if (res.status === 404) { this.set({ status: 'current' }); return; }
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const rel = await res.json();
      const v = String(rel.tag_name || '').replace(/^v/, '');
      if (v && newer(v, this.app.getVersion())) this.set({ status: 'available', version: v, url: rel.html_url || RELEASES });
      else this.set({ status: 'current' });
    } catch (e) { this.fail(e); }
  }

  install() { if (this.updater && this.state.status === 'ready') this.updater.quitAndInstall(false, true); }
}

module.exports = { Updates, newer, plain, RELEASES, OWNER, REPO };

// A window inside Rack for choosing a cover from Google Images.
// The top strip is Rack's own page; below it is Google, with a "Use this image" button on pictures
// and a right-click option. Google's page gets no access to Rack: it can only log a picked link.
'use strict';
const { BaseWindow, WebContentsView, Menu, nativeTheme, session } = require('electron');
const path = require('path');

const TOP = 64;
const PICK = '__RACK_PICK__';

// Runs inside Google's page. Puts a button on the picture under the pointer.
const INJECT = `(() => {
  if (window.__rackPicker) return; window.__rackPicker = true;
  const b = document.createElement('button');
  b.textContent = 'Use this image';
  b.style.cssText = 'position:fixed;z-index:2147483647;display:none;padding:8px 14px;border:0;border-radius:8px;background:#1b1f27;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer';
  let target = null;
  const best = (img) => {
    const a = img.closest('a[href*="imgurl="]');
    if (a) { try { const u = new URL(a.href).searchParams.get('imgurl'); if (u) return u; } catch (e) {} }
    return img.currentSrc || img.src;
  };
  const place = (img) => {
    const r = img.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) { b.style.display = 'none'; target = null; return; }
    target = img;
    b.style.left = Math.max(4, r.left + 8) + 'px';
    b.style.top = Math.max(4, r.top + 8) + 'px';
    b.style.display = 'block';
  };
  document.addEventListener('mouseover', (e) => {
    if (e.target === b) return;
    const img = e.target.closest && e.target.closest('img');
    if (img) place(img); else if (!b.contains(e.target)) { b.style.display = 'none'; target = null; }
  }, true);
  document.addEventListener('scroll', () => { b.style.display = 'none'; }, true);
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!target) return;
    const big = target.naturalWidth >= 300 || target.getBoundingClientRect().width >= 260;
    console.log('${PICK}' + JSON.stringify({ url: best(target), small: !big, w: target.naturalWidth, h: target.naturalHeight }));
  }, true);
  document.documentElement.appendChild(b);
})();`;

/**
 * open({ parent, game, onPick(url, viewSession) -> Promise<true|string error>, searchUrl? }) -> window
 */
function open({ parent, game, onPick, searchUrl }) {
  const dark = nativeTheme.shouldUseDarkColors;
  const win = new BaseWindow({
    parent, modal: true, width: 1180, height: 820, minWidth: 760, minHeight: 520,
    title: `Choose a cover for ${game.name}`, backgroundColor: dark ? '#1b1f27' : '#eef0f3', autoHideMenuBar: true, show: false,
  });
  const ses = session.fromPartition('persist:rack-images');
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const bar = new WebContentsView({ webPreferences: { preload: path.join(__dirname, '..', 'picker-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const web = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: true } });
  win.contentView.addChildView(web);
  win.contentView.addChildView(bar);
  const layout = () => {
    const { width, height } = win.getContentBounds();
    bar.setBounds({ x: 0, y: 0, width, height: TOP });
    web.setBounds({ x: 0, y: TOP, width, height: Math.max(0, height - TOP) });
  };
  layout();
  win.on('resize', layout);

  const query = `${game.name} game cover`;
  const url = (q, tall) => searchUrl ? searchUrl(q) : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}${tall ? '&tbs=iar:t' : ''}`;
  let tall = true;
  const say = (text, kind = '') => { if (!bar.webContents.isDestroyed()) bar.webContents.send('picker:status', { text, kind }); };
  let busy = false;
  async function pick(u, small) {
    if (busy || !u) return;
    if (!/^(https?:|data:image\/)/i.test(u)) { say('That isn’t an image Rack can use.', 'warn'); return; }
    if (small) { say('That’s a small preview. Click the picture to open it full size, then use the big one.', 'warn'); return; }
    busy = true;
    say('Downloading the image…');
    const r = await onPick(u, ses);
    busy = false;
    if (r === true) { win.close(); return; }
    say(r || 'Could not use that image. Try another one.', 'warn');
  }

  web.webContents.on('console-message', (e, ...rest) => {
    const msg = typeof e.message === 'string' ? e.message : rest[1];
    if (typeof msg !== 'string' || !msg.startsWith(PICK)) return;
    try { const d = JSON.parse(msg.slice(PICK.length)); pick(d.url, d.small); } catch { /* ignore */ }
  });
  const inject = () => web.webContents.executeJavaScript(INJECT).catch(() => {});
  web.webContents.on('dom-ready', inject);
  web.webContents.on('did-navigate-in-page', inject);
  web.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.mediaType === 'image' && p.srcURL) items.push({ label: 'Use this image as the cover', click: () => pick(p.srcURL, false) });
    items.push({ label: 'Back', enabled: web.webContents.navigationHistory.canGoBack(), click: () => web.webContents.navigationHistory.goBack() });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  web.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:/i.test(u)) web.webContents.loadURL(u); return { action: 'deny' }; });

  const { ipcMain } = require('electron');
  const onMsg = (e, kind, value) => {
    if (e.sender !== bar.webContents) return;
    if (kind === 'search') web.webContents.loadURL(url(String(value || query), tall));
    if (kind === 'tall') { tall = !!value; web.webContents.loadURL(url(lastQuery, tall)); }
    if (kind === 'back' && web.webContents.navigationHistory.canGoBack()) web.webContents.navigationHistory.goBack();
    if (kind === 'close') win.close();
    if (kind === 'q') lastQuery = String(value || query);
  };
  let lastQuery = query;
  ipcMain.on('picker', onMsg);
  win.on('closed', () => { ipcMain.removeListener('picker', onMsg); try { web.webContents.close(); bar.webContents.close(); } catch { /* gone */ } });

  bar.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'picker.html'), { query: { q: query, name: game.name, dark: dark ? '1' : '0' } });
  web.webContents.loadURL(url(query, tall));
  bar.webContents.once('did-finish-load', () => win.show());
  return { win, web, bar, pick };
}

module.exports = { open, INJECT, PICK };

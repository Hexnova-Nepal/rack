// Watches the folders you keep games in, so a new game is noticed when it arrives.
// A copy, a download or an installer writes files for a while. This waits until a folder has been
// quiet, so a game is looked at once it is whole, and then says which folder to check.
'use strict';
const fs = require('fs');
const path = require('path');

/** A whole drive (D:\) or the root of the file system: too busy to watch file by file. */
const isDrive = (p) => /^[a-z]:[\\/]*$/i.test(String(p || '').trim()) || path.resolve(String(p || '.')) === path.parse(path.resolve(String(p || '.'))).root;

class FolderWatch {
  /**
   * onQuiet(id): the folder changed and has been quiet since; check it now.
   * known(id): folders of games already in the library, as lower-case paths; changes inside them
   *   (saves, logs, updates) don't count.
   * canCheck(): false while a check would be unwelcome (a game is running); it is tried again later.
   */
  constructor({ onQuiet, known = () => [], canCheck = () => true, quietMs = 45000, gapMs = 120000, retryMs = 30000, watch = fs.watch, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    Object.assign(this, { onQuiet, known, canCheck, quietMs, gapMs, retryMs, watch, now, setTimer, clearTimer });
    this.map = new Map(); // id -> { path, watcher, timer, last, checked, dirty }
  }

  /** Watches exactly these folders: [{ id, path }]. Starts and stops watchers to match. Returns the ids being watched. */
  set(folders) {
    const want = new Map((folders || []).filter((f) => f && f.id && f.path && !isDrive(f.path)).map((f) => [f.id, f.path]));
    for (const [id, w] of this.map) if (want.get(id) !== w.path) this.stop(id);
    for (const [id, p] of want) {
      if (this.map.has(id)) continue;
      const w = { path: p, watcher: null, timer: null, last: 0, checked: 0, dirty: false };
      try {
        w.watcher = this.watch(p, { recursive: true, persistent: false }, (_event, file) => this.changed(id, file));
        if (w.watcher && w.watcher.on) w.watcher.on('error', () => this.stop(id)); // the drive went away
        this.map.set(id, w);
      } catch { /* can't be watched (a network share, a missing drive): the half-hourly check still covers it */ }
    }
    return [...this.map.keys()];
  }

  stop(id) {
    const w = this.map.get(id);
    if (!w) return;
    this.clearTimer(w.timer);
    try { w.watcher.close(); } catch { /* already closed */ }
    this.map.delete(id);
  }
  close() { for (const id of [...this.map.keys()]) this.stop(id); }

  /** Something changed in a watched folder. file is relative to the folder and can be missing. */
  changed(id, file) {
    const w = this.map.get(id);
    if (!w) return;
    if (file) {
      const full = path.join(w.path, String(file)).toLowerCase();
      for (const dir of this.known(id)) if (dir && (full === dir || full.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep))) return;
    }
    w.last = this.now();
    w.dirty = true;
    this.arm(id, this.quietMs);
  }
  arm(id, ms) {
    const w = this.map.get(id);
    if (!w) return;
    this.clearTimer(w.timer);
    w.timer = this.setTimer(() => this.fire(id), ms);
    if (w.timer && w.timer.unref) w.timer.unref();
  }
  fire(id) {
    const w = this.map.get(id);
    if (!w || !w.dirty) return;
    const t = this.now();
    if (t - w.last < this.quietMs) return this.arm(id, this.quietMs - (t - w.last));       // still being written
    if (t - w.checked < this.gapMs) return this.arm(id, this.gapMs - (t - w.checked));     // checked a moment ago
    if (!this.canCheck()) return this.arm(id, this.retryMs);
    w.dirty = false; w.checked = t;
    this.onQuiet(id);
  }

  /** True while files in the folder are still changing, so a check now could see half a game. */
  busy(id) { const w = this.map.get(id); return !!w && w.dirty && this.now() - w.last < this.quietMs; }
  watching(id) { return this.map.has(id); }
}

module.exports = { FolderWatch, isDrive };

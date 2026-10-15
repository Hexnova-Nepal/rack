// Wallpaper pictures from folders you choose. Rack only ever serves files it found in those folders:
// the interface gets an id for each picture, never a path, and rack://wall/<id> serves nothing else.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const SLOTS = ['morning', 'day', 'evening', 'night'];
const MAX = 2000;

/** Pictures in a folder and the folders inside it (two levels down), sorted by name. */
function listPictures(dir, { max = MAX, depth = 2 } = {}) {
  const out = [];
  const walk = (d, left) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of items) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isFile() && IMAGE.test(e.name)) out.push(p);
      else if (e.isDirectory() && left > 0 && !e.name.startsWith('.')) walk(p, left - 1);
    }
  };
  if (dir) walk(dir, depth);
  return out;
}

/** The part of the day a time falls in: morning 5–11, day 11–17, evening 17–21, night 21–5. */
function slotOf(date = new Date()) {
  const h = date.getHours();
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
}

class Pictures {
  constructor() { this.files = new Map(); } // id -> absolute path

  static id(file) { return crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 20); }

  /** Lists every folder in the wallpaper settings: { main: [...], morning: [...], ... }, each item { id, url, name }. */
  list(wall) {
    const w = wall || {};
    this.files.clear();
    const take = (dir) => listPictures(dir).map((f) => {
      const id = Pictures.id(f);
      this.files.set(id, f);
      return { id, url: `rack://wall/${id}`, name: path.basename(f) };
    });
    const out = { main: take(w.folder) };
    for (const s of SLOTS) out[s] = w.times && w.times[s] ? take(w.times[s]) : [];
    return out;
  }

  /** The file for an id, only if Rack listed it and it is still a picture on disk. */
  file(id) {
    const f = this.files.get(String(id || ''));
    if (!f || !IMAGE.test(f)) return null;
    try { return fs.statSync(f).isFile() ? f : null; } catch { return null; }
  }
}

module.exports = { listPictures, slotOf, Pictures, SLOTS, IMAGE };

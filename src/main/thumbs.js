// Small copies of covers, for tiles and lists.
// Covers are stored at full size, up to 1200 x 1800. A tile shows them at about a sixth of that,
// and a decoded picture takes memory by its full size, so Rack keeps a 400 px wide copy of each
// cover in the thumbs folder and the interface draws that. A copy is made the first time it is
// asked for; a cover Rack can't shrink (WebP, GIF, AVIF, or one already small) is used as it is.
'use strict';
const fs = require('fs');
const path = require('path');

const WIDTH = 400;
const CAN = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png' };

class Thumbs {
  /** resize(file, width, 'jpeg' | 'png') returns the smaller picture as a Buffer, or null when it can't or needn't. */
  constructor({ coverDir, dir, resize }) {
    this.coverDir = coverDir;
    this.dir = dir;
    this.resize = resize;
    this.skip = new Set();      // covers that are used as they are
    this.line = Promise.resolve();
  }

  /** The file to draw for a cover: its small copy, or the cover itself. One copy is made at a time. */
  file(name) {
    const base = path.basename(String(name || ''));
    if (!base) return Promise.resolve(null);
    const src = path.join(this.coverDir, base);
    const kind = CAN[path.extname(base).toLowerCase()];
    if (!kind || this.skip.has(base)) return Promise.resolve(src);
    const out = path.join(this.dir, base);
    if (this.made(out)) return Promise.resolve(out);
    const job = this.line.then(() => new Promise((done) => setImmediate(() => {
      if (this.made(out)) return done(out);
      try {
        const buf = this.resize(src, WIDTH, kind);
        if (!buf || !buf.length) { this.skip.add(base); return done(src); }
        fs.mkdirSync(this.dir, { recursive: true });
        fs.writeFileSync(out + '.tmp', buf);
        fs.renameSync(out + '.tmp', out);
        done(out);
      } catch { this.skip.add(base); done(src); }
    })));
    this.line = job;
    return job;
  }

  made(out) { try { return fs.statSync(out).size > 0; } catch { return false; } }

  /** Deletes small copies whose cover is gone. Returns how many. */
  prune() {
    let n = 0;
    let names = [];
    try { names = fs.readdirSync(this.dir); } catch { return 0; }
    for (const f of names) {
      if (fs.existsSync(path.join(this.coverDir, f))) continue;
      try { fs.unlinkSync(path.join(this.dir, f)); n++; } catch { /* in use */ }
    }
    return n;
  }
}

module.exports = { Thumbs, WIDTH };

// Reads what a Windows .exe says about itself: its version info (name, company, description),
// whether it is a windowed or console program, and which DLLs it imports. Reads only the bytes it needs.
'use strict';
const fsp = require('fs').promises;

async function readAt(fh, pos, len) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return bytesRead === len ? buf : buf.subarray(0, bytesRead);
}

function utf16z(buf, off, maxBytes) {
  let s = '';
  for (let p = off; p + 1 < buf.length && p < off + maxBytes; p += 2) {
    const c = buf.readUInt16LE(p);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}
const align4 = (n) => (n + 3) & ~3;

/** VS_VERSIONINFO -> { ProductName, FileDescription, CompanyName, ... } */
function parseVersion(buf) {
  const out = {};
  function block(off) {
    if (off + 6 > buf.length) return null;
    const len = buf.readUInt16LE(off), vlen = buf.readUInt16LE(off + 2), type = buf.readUInt16LE(off + 4);
    if (len < 6 || off + len > buf.length + 4) return null;
    const key = utf16z(buf, off + 6, 512);
    let p = align4(off + 6 + (key.length + 1) * 2);
    const valStart = p, valBytes = type === 1 ? vlen * 2 : vlen;
    p = align4(p + valBytes);
    return { key, type, valStart, valBytes, children: p, end: Math.min(off + len, buf.length) };
  }
  function kids(b, fn) {
    let p = b.children;
    while (p + 6 <= b.end) {
      const c = block(p);
      if (!c || c.end <= p) break;
      fn(c);
      p = align4(c.end);
    }
  }
  const root = block(0);
  if (!root || root.key !== 'VS_VERSION_INFO') return out;
  kids(root, (sfi) => {
    if (sfi.key !== 'StringFileInfo') return;
    kids(sfi, (table) => {
      kids(table, (str) => {
        if (str.key && !(str.key in out)) out[str.key] = utf16z(buf, str.valStart, str.valBytes || 2048).trim();
      });
    });
  });
  return out;
}

/**
 * info(file) -> { gui, console, is64, imports: Set<lowercase dll>, version: {...} } or null if not a PE file.
 */
async function info(file) {
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const head = await readAt(fh, 0, 4096);
    if (head.length < 512 || head.readUInt16LE(0) !== 0x5a4d) return null;
    const pe = head.readUInt32LE(0x3c);
    let h = head;
    if (pe + 256 > head.length) h = await readAt(fh, 0, pe + 1024);
    if (h.readUInt32LE(pe) !== 0x4550) return null;
    const nSec = h.readUInt16LE(pe + 6), optSize = h.readUInt16LE(pe + 20), opt = pe + 24;
    const magic = h.readUInt16LE(opt), plus = magic === 0x20b;
    const subsystem = h.readUInt16LE(opt + 68);
    const dd = opt + (plus ? 112 : 96);
    const dir = (i) => ({ rva: h.readUInt32LE(dd + i * 8), size: h.readUInt32LE(dd + i * 8 + 4) });
    const secOff = opt + optSize;
    if (secOff + nSec * 40 > h.length) h = await readAt(fh, 0, secOff + nSec * 40 + 64);
    const secs = [];
    for (let i = 0; i < nSec; i++) {
      const o = secOff + i * 40;
      secs.push({ va: h.readUInt32LE(o + 12), vsize: h.readUInt32LE(o + 8), rawSize: h.readUInt32LE(o + 16), raw: h.readUInt32LE(o + 20) });
    }
    const secOf = (rva) => secs.find((s) => rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize));
    // reads by 64 KB pages, so a 200 MB exe costs a few page reads, not the whole file
    const PAGE = 65536, pages = new Map();
    async function page(n) {
      if (!pages.has(n)) { if (pages.size > 64) pages.clear(); pages.set(n, await readAt(fh, n * PAGE, PAGE)); }
      return pages.get(n);
    }
    async function bytes(pos, len) {
      const out = Buffer.alloc(len);
      let got = 0;
      while (got < len) {
        const n = Math.floor((pos + got) / PAGE), pg = await page(n), o = (pos + got) - n * PAGE;
        if (o >= pg.length) break;
        const k = Math.min(len - got, pg.length - o);
        pg.copy(out, got, o, o + k);
        got += k;
      }
      return got === len ? out : out.subarray(0, got);
    }
    /** len bytes at a virtual address, as { buf, off: 0 } */
    async function at(rva, len = 4096) {
      const s = secOf(rva);
      if (!s) return null;
      const fileOff = rva - s.va + s.raw;
      const max = Math.max(0, s.raw + s.rawSize - fileOff);
      return { buf: await bytes(fileOff, Math.min(len, max)), off: 0 };
    }

    // imports
    const imports = new Set();
    const imp = dir(1);
    if (imp.rva) {
      const r = await at(imp.rva, Math.min(Math.max(imp.size, 20), 20 * 400));
      if (r) {
        for (let p = r.off; p + 20 <= r.buf.length && imports.size < 400; p += 20) {
          const nameRva = r.buf.readUInt32LE(p + 12);
          if (!nameRva && !r.buf.readUInt32LE(p + 16)) break;
          const n = await at(nameRva, 260);
          if (!n) continue;
          let e = n.off;
          while (e < n.buf.length && n.buf[e] && e - n.off < 260) e++;
          imports.add(n.buf.toString('latin1', n.off, e).toLowerCase());
        }
      }
    }

    // version resource: type 16 (RT_VERSION), first name, first language
    let version = {};
    const res = dir(2);
    if (res.rva) {
      const r = await at(res.rva, Math.min(res.size || 262144, 262144));
      if (r) {
        const b = r.buf, base = r.off;
        const entries = (off) => {
          if (base + off + 16 > b.length) return [];
          const n = b.readUInt16LE(base + off + 12) + b.readUInt16LE(base + off + 14), list = [];
          for (let i = 0; i < n && i < 512; i++) {
            const e = base + off + 16 + i * 8;
            if (e + 8 > b.length) break;
            list.push({ id: b.readUInt32LE(e), data: b.readUInt32LE(e + 4) });
          }
          return list;
        };
        const sub = (e) => (e.data & 0x80000000 ? e.data & 0x7fffffff : -1);
        const ver = entries(0).find((e) => e.id === 16 && sub(e) >= 0);
        const name = ver && entries(sub(ver)).find((e) => sub(e) >= 0);
        const lang = name && entries(sub(name))[0];
        if (lang && sub(lang) < 0 && base + lang.data + 8 <= b.length) {
          const dataRva = b.readUInt32LE(base + lang.data), size = b.readUInt32LE(base + lang.data + 4);
          const v = size < 1 << 20 ? await at(dataRva, size) : null;
          if (v) version = parseVersion(v.buf.subarray(v.off, v.off + size));
        }
      }
    }
    return { gui: subsystem === 2, console: subsystem === 3, is64: plus, imports, version };
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

module.exports = { info, parseVersion };

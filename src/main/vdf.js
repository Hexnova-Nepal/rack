// A small parser for Valve's KeyValues text format (.vdf / .acf).
'use strict';

function parse(text) {
  let i = 0;
  const n = text.length;

  function skip() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      break;
    }
  }

  function token() {
    skip();
    if (i >= n) return null;
    const c = text[i];
    if (c === '{' || c === '}') { i++; return { t: c }; }
    if (c === '"') {
      i++;
      let s = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else s += text[i++];
      }
      i++;
      return { t: 's', v: s };
    }
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return { t: 's', v: s };
  }

  function object() {
    const out = {};
    for (;;) {
      const k = token();
      if (!k || k.t === '}') return out;
      if (k.t !== 's') continue;
      const v = token();
      if (!v) return out;
      if (v.t === '{') out[k.v] = object();
      else if (v.t === 's') out[k.v] = v.v;
    }
  }

  return object();
}

/** Case-insensitive lookup along a path of keys. */
function get(obj, ...keys) {
  let cur = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    const want = String(key).toLowerCase();
    const hit = Object.keys(cur).find((k) => k.toLowerCase() === want);
    if (hit === undefined) return undefined;
    cur = cur[hit];
  }
  return cur;
}

module.exports = { parse, get };

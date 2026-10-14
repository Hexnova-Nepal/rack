// Cover art and descriptions: Steam's local cache, Steam's CDN, SteamGridDB, the Steam store.
'use strict';
const fs = require('fs');
const path = require('path');

const SGDB = 'https://www.steamgriddb.com/api/v2';
const DIMS = '600x900,342x482,660x930';

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

class Covers {
  constructor({ fetch, coverDir, imageSize }) {
    this.fetch = fetch;
    this.dir = coverDir;
    this.imageSize = imageSize || (() => null); // (buffer) -> { width, height } or null
  }

  async json(url, key) {
    const res = await this.fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    if (res.status === 401 || res.status === 403) throw new Error('SteamGridDB rejected the API key. Check it in Settings.');
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  /** Downloads an image into the covers folder; returns the file name. fetchFn lets the picker use its own session. */
  async download(url, gameId, fetchFn = this.fetch) {
    let buf, type;
    const data = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
    if (data) { type = data[1]; buf = Buffer.from(data[2], 'base64'); } else {
      const res = await fetchFn(url, { headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' } });
      if (!res.ok) throw new Error(`The site refused the download (${res.status}). Try another picture.`);
      type = res.headers.get('content-type') || '';
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!/^image\/(jpe?g|png|webp|gif|avif)/i.test(type) && !/^\xff\xd8|^\x89png/i.test(buf.subarray(0, 4).toString('latin1'))) throw new Error('That link is not a picture Rack can use. Try another one.');
    if (buf.length < 2000) throw new Error('That picture is too small. Click it first to open the full size.');
    const dim = this.imageSize(buf);
    if (dim && dim.width && dim.width < 180) throw new Error(`That picture is only ${dim.width}×${dim.height}. Click it first to open the full size.`);
    const ext = /png/i.test(type) ? '.png' : /webp/i.test(type) ? '.webp' : /gif/i.test(type) ? '.gif' : /avif/i.test(type) ? '.avif' : '.jpg';
    return this.saveBuffer(buf, gameId, ext);
  }

  saveBuffer(buf, gameId, ext) {
    const name = `${gameId}-${Date.now().toString(36)}${ext}`;
    fs.writeFileSync(path.join(this.dir, name), buf);
    return name;
  }

  copyFile(file, gameId) {
    const ext = (path.extname(file) || '.jpg').toLowerCase();
    return this.saveBuffer(fs.readFileSync(file), gameId, ext);
  }

  remove(name) {
    if (!name) return;
    try { fs.unlinkSync(path.join(this.dir, path.basename(name))); } catch { /* already gone */ }
  }

  /** SteamGridDB matches for a game: Steam games by app id, others by name. */
  async matches(game, key) {
    if (!key) throw new Error('Add a SteamGridDB API key in Settings to find covers.');
    let grids = [];
    if (game.source === 'steam' && game.sourceId) {
      try { grids = (await this.json(`${SGDB}/grids/steam/${game.sourceId}?dimensions=${DIMS}&nsfw=false&humor=false`, key)).data || []; } catch (e) { if (/API key/.test(e.message)) throw e; }
    }
    if (!grids.length) {
      const found = (await this.json(`${SGDB}/search/autocomplete/${encodeURIComponent(game.name)}`, key)).data || [];
      if (!found.length) return [];
      grids = (await this.json(`${SGDB}/grids/game/${found[0].id}?dimensions=${DIMS}&nsfw=false&humor=false`, key)).data || [];
    }
    return grids.slice(0, 18).map((g) => ({ url: g.url, thumb: g.thumb || g.url, author: (g.author && g.author.name) || '' }));
  }

  /** A Steam app id for a game name, when the Steam store has a clear match. */
  async steamMatch(name) {
    if (!name || norm(name).length < 2) return null;
    const data = await this.json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`);
    const items = (data && data.items) || [];
    const want = norm(name);
    const hit = items.find((i) => norm(i.name) === want)
      || items.find((i) => norm(i.name).replace(/(gameoftheyear|goty|definitive|complete|enhanced|remastered|deluxe)edition$/, '') === want.replace(/(gameoftheyear|goty|definitive|complete|enhanced|remastered|deluxe)edition$/, ''));
    return hit ? { id: String(hit.id), name: hit.name } : null;
  }

  async steamArt(appid, gameId) {
    for (const u of [
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900_2x.jpg`,
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
    ]) {
      try { return await this.download(u, gameId); } catch { /* try the next */ }
    }
    return null;
  }

  /** Best automatic cover; returns { file, steamAppId? } or null. */
  async auto(game, { key, steamRoot, steamCachedCover }) {
    const appid = (game.source === 'steam' && game.sourceId) || game.steamAppId;
    if (appid) {
      const cached = game.source === 'steam' ? steamCachedCover(steamRoot, appid) : null;
      if (cached) return { file: this.copyFile(cached, game.id) };
      const f = await this.steamArt(appid, game.id);
      if (f) return { file: f };
    }
    if (key) {
      try {
        const list = await this.matches(game, key);
        if (list.length) return { file: await this.download(list[0].url, game.id) };
      } catch (e) { if (/API key/.test(e.message)) throw e; }
    }
    if (!appid) {
      const m = await this.steamMatch(game.name).catch(() => null);
      if (m) {
        const f = await this.steamArt(m.id, game.id);
        if (f) return { file: f, steamAppId: m.id };
      }
    }
    return null;
  }

  /** Description, genres, release year and developer from the Steam store. */
  async steamDetails(appid) {
    const data = await this.json(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`);
    const d = data && data[appid] && data[appid].success && data[appid].data;
    if (!d) return null;
    const text = (s) => String(s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .trim();
    const year = (/(\d{4})/.exec((d.release_date && d.release_date.date) || '') || [])[1];
    return {
      description: text(d.short_description),
      genres: (d.genres || []).map((g) => g.description).filter(Boolean).slice(0, 4),
      year: year ? Number(year) : null,
      developer: (d.developers || [])[0] || '',
      type: d.type || '',
    };
  }
}

module.exports = { Covers };

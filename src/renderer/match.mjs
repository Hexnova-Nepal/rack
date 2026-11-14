// Finding a game from a few typed letters, for the quick-launch box.

/** Lower case, accents and punctuation removed, single spaces: "Pokémon: Let's Go!" becomes "pokemon let s go". */
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * How well a name matches what was typed; 0 is no match. Best first:
 * the whole name, the start of the name, the starts of its words in order ("wit 3" finds
 * The Witcher 3), its initials ("gta"), anywhere inside it, and last its letters in order
 * with small gaps ("hlwknt" finds Hollow Knight).
 */
export function score(name, typed) {
  const n = fold(name), q = fold(typed);
  if (!q || !n) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 900 - Math.min(99, n.length - q.length);
  const words = n.split(' ');
  let at = 0, all = true;
  for (const part of q.split(' ')) {
    let found = -1;
    for (let k = at; k < words.length; k++) if (words[k].startsWith(part)) { found = k; break; }
    if (found < 0) { all = false; break; }
    at = found + 1;
  }
  if (all) return 700 - Math.min(99, n.length);
  const tight = q.replace(/ /g, '');
  if (tight.length >= 2 && words.map((w) => w[0]).join('').startsWith(tight)) return 650 - Math.min(49, words.length);
  const inside = n.indexOf(q);
  if (inside >= 0) return 500 - Math.min(99, inside);
  // letters in order with gaps, for a name typed in a hurry. Only from four letters on, starting
  // where a word starts, and without big gaps: otherwise almost any name matches a short word
  if (tight.length < 4) return 0;
  let best = 0;
  for (let from = 0; from < n.length; from++) {
    if (n[from] !== tight[0] || (from > 0 && n[from - 1] !== ' ')) continue;
    let i = 1, last = from, gaps = 0;
    for (let k = from + 1; k < n.length && i < tight.length; k++) {
      if (n[k] !== tight[i]) continue;
      gaps += k - last - 1; last = k; i++;
    }
    if (i === tight.length && gaps <= tight.length * 1.5) best = Math.max(best, 300 - gaps * 8);
  }
  return Math.max(0, best);
}

/** The best matches, best first; ties go to the game played most recently. Nothing typed: the games played last. */
export function search(games, typed, limit = 8) {
  const recent = (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name);
  if (!fold(typed)) return [...games].sort(recent).slice(0, limit);
  return games.map((g) => [score(g.name, typed), g]).filter((x) => x[0] > 0)
    .sort((a, b) => b[0] - a[0] || recent(a[1], b[1])).slice(0, limit).map((x) => x[1]);
}

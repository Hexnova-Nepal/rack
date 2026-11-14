// Adds up play sessions for the Play stats screen.
// sessions: [[gameId, startMs, minutes], ...]. All times are the PC's local time.

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d) => addDays(dayStart(d), -((d.getDay() + 6) % 7));
const dm = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** The buckets of a period, oldest first: 30 days, 12 weeks (Monday to Sunday) or 12 calendar months, ending now. */
export function buckets(period, now = new Date()) {
  const out = [];
  if (period === 'months') {
    for (let i = 11; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({ start: a.getTime(), end: b.getTime(), label: MONTHS[a.getMonth()], long: `${MONTHS[a.getMonth()]} ${a.getFullYear()}`, now: i === 0 });
    }
  } else if (period === 'weeks') {
    const m = monday(now);
    for (let i = 11; i >= 0; i--) {
      const a = addDays(m, -7 * i), b = addDays(a, 7);
      out.push({ start: a.getTime(), end: b.getTime(), label: dm(a), long: i === 0 ? 'This week' : `Week of ${dm(a)}`, now: i === 0 });
    }
  } else {
    const t = dayStart(now);
    for (let i = 29; i >= 0; i--) {
      const a = addDays(t, -i), b = addDays(a, 1);
      out.push({ start: a.getTime(), end: b.getTime(), label: String(a.getDate()), long: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${WEEKDAYS[(a.getDay() + 6) % 7]} ${dm(a)}`, now: i === 0, first: a.getDate() === 1 ? MONTHS[a.getMonth()] : '' });
    }
  }
  return out;
}

/** Everything the screen shows for one period. A session counts where it started. */
export function summarise(sessions, period, now = new Date()) {
  const bs = buckets(period, now).map((b) => ({ ...b, minutes: 0, sessions: 0 }));
  const from = bs[0].start, to = bs[bs.length - 1].end, span = to - from;
  const games = new Map(), days = new Set(), weekdays = new Array(7).fill(0), inPeriod = [];
  let total = 0, count = 0, before = 0;
  for (const [id, start, minutes] of sessions || []) {
    if (!(minutes > 0) || !(start > 0)) continue;
    if (start >= from - span && start < from) before += minutes;
    if (start < from || start >= to) continue;
    // buckets are in order and don't overlap, so find this one by walking back from the end (most play is recent)
    let b = null;
    for (let i = bs.length - 1; i >= 0; i--) if (start >= bs[i].start) { b = bs[i]; break; }
    if (!b) continue;
    b.minutes += minutes; b.sessions++;
    total += minutes; count++;
    const d = new Date(start);
    days.add(dayStart(d).getTime());
    weekdays[(d.getDay() + 6) % 7] += minutes;
    const g = games.get(id) || { id, minutes: 0, sessions: 0 };
    g.minutes += minutes; g.sessions++;
    games.set(id, g);
    inPeriod.push({ id, start, minutes });
  }
  const top = [...games.values()].sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
  const longest = inPeriod.sort((a, b) => b.minutes - a.minutes || b.start - a.start).slice(0, 5);
  const totalDays = Math.max(1, Math.round((Math.min(to, dayStart(now).getTime() + DAY) - from) / DAY));
  return {
    period, buckets: bs, total, sessions: count, games: games.size, top, longest,
    daysPlayed: days.size, totalDays, weekdays: weekdays.map((minutes, i) => ({ label: WEEKDAYS[i], minutes })),
    before, // minutes in the period of the same length just before this one
    change: before > 0 ? Math.round(((total - before) / before) * 100) : null,
  };
}

/** A round top for the chart's scale and the steps to draw lines at, in minutes. */
export function scale(maxMinutes) {
  const steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 7200, 14400];
  const step = steps.find((s) => maxMinutes / s <= 4) || Math.ceil(maxMinutes / 4 / 14400) * 14400;
  const top = Math.max(step, Math.ceil(maxMinutes / step) * step);
  const ticks = [];
  for (let v = step; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

/** "45 min", "2 h", "2 h 30 min". */
export const span = (min) => { const m = Math.round(min); return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60).toLocaleString()} h ${m % 60} min` : `${(m / 60).toLocaleString()} h`; };

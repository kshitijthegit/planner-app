// Timezone helpers (no external libs). Workers support Intl with IANA zones.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  minutes: number; // minutes since local midnight
  weekday: number; // 0 = Sunday
}

export function localParts(d: Date, tz: string): LocalParts {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, time, minutes: Number(p.hour) * 60 + Number(p.minute), weekday };
}

/** Offset of tz from UTC at instant d, in minutes (SGT = +480). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Convert a wall-clock time in tz to a UTC Date. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(result), tz);
  if (off2 !== off) result = guess - off2 * 60000;
  return new Date(result);
}

export function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

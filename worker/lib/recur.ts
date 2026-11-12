// Recurring own events: expand a series into occurrences inside a window.
import { addDaysIso, addMonthsIso, localParts, zonedToUtc } from './time';

export const RECURRENCES = ['daily', 'weekdays', 'weekly', 'monthly'];
/** Custom repeat, e.g. "every:3:day", "every:2:week", "every:6:month". */
export const CUSTOM_RECURRENCE = /^every:([1-9]\d{0,2}):(day|week|month)$/;

export function validRecurrence(r: unknown): boolean {
  return r == null || (typeof r === 'string' && (RECURRENCES.includes(r) || CUSTOM_RECURRENCE.test(r)));
}

export function nextDue(date: string, rule: string): string {
  const custom = CUSTOM_RECURRENCE.exec(rule);
  if (custom) {
    const n = Number(custom[1]);
    return custom[2] === 'day' ? addDaysIso(date, n) : custom[2] === 'week' ? addDaysIso(date, 7 * n) : addMonthsIso(date, n);
  }
  switch (rule) {
    case 'daily':
      return addDaysIso(date, 1);
    case 'weekdays': {
      let d = addDaysIso(date, 1);
      while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDaysIso(d, 1);
      return d;
    }
    case 'weekly':
      return addDaysIso(date, 7);
    default:
      return addMonthsIso(date, 1);
  }
}

export interface SeriesRow {
  start_at: string;
  end_at: string;
  all_day: number;
  recurrence: string | null;
  recur_until: string | null; // YYYY-MM-DD inclusive
}

/** Occurrences [start, end] (stored format) of a series that overlap [fromMs, toMs). Wall-clock time is kept in tz across DST. */
export interface Occurrence {
  start_at: string;
  end_at: string;
  /** Local date of this occurrence's original start: identifies it for per-occurrence changes. */
  occ_date: string;
}

export function occurrences(ev: SeriesRow, fromMs: number, toMs: number, tz: string, max = 1000): Occurrence[] {
  if (!ev.recurrence)
    return [{ start_at: ev.start_at, end_at: ev.end_at, occ_date: ev.all_day ? ev.start_at.slice(0, 10) : localParts(new Date(ev.start_at), tz).date }];
  const out: Occurrence[] = [];
  if (ev.all_day) {
    const spanDays = Math.max(1, Math.round((Date.parse(`${ev.end_at.slice(0, 10)}T00:00:00Z`) - Date.parse(`${ev.start_at.slice(0, 10)}T00:00:00Z`)) / 86400000));
    let d = ev.start_at.slice(0, 10);
    for (let i = 0; i < max; i++) {
      if (ev.recur_until && d > ev.recur_until) break;
      const startMs = Date.parse(`${d}T00:00:00Z`);
      if (startMs - 86400000 > toMs) break;
      const end = addDaysIso(d, spanDays);
      if (Date.parse(`${end}T00:00:00Z`) + 86400000 > fromMs) out.push({ start_at: d, end_at: end, occ_date: d });
      d = nextDue(d, ev.recurrence);
    }
    return out;
  }
  const durMs = Date.parse(ev.end_at) - Date.parse(ev.start_at);
  const local = localParts(new Date(ev.start_at), tz);
  let d = local.date;
  for (let i = 0; i < max; i++) {
    if (ev.recur_until && d > ev.recur_until) break;
    const s = zonedToUtc(d, local.time, tz).getTime();
    if (s >= toMs) break;
    if (s + durMs > fromMs) out.push({ start_at: new Date(s).toISOString(), end_at: new Date(s + durMs).toISOString(), occ_date: d });
    d = nextDue(d, ev.recurrence);
  }
  return out;
}

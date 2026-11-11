// Natural-language quick add, e.g. "laundry sat 10am #chores !high 30m"
import type { Category, Area } from '../api';
import { addDays, parseYmd, ymd } from './date';

export interface QuickAddResult {
  title: string;
  category_id: string | null;
  priority: number;
  due_date: string | null;
  due_time: string | null;
  duration_min: number | null;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(s: string): number {
  return MONTHS.indexOf(s.slice(0, 3).toLowerCase());
}

function futureDate(month: number, day: number, today: Date): string | null {
  let d = new Date(today.getFullYear(), month, day);
  if (d.getMonth() !== month) return null;
  if (d < parseYmd(ymd(today))) d = new Date(today.getFullYear() + 1, month, day);
  return ymd(d);
}

function parseTime(tok: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/i.exec(tok);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (!ap && m[2] === undefined) return null; // bare number is not a time
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseQuickAdd(input: string, categories: Category[], areas: Area[], today = new Date()): QuickAddResult {
  const out: QuickAddResult = { title: '', category_id: null, priority: 0, due_date: null, due_time: null, duration_min: null };
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const keep: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const t = raw.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    if (t.startsWith('#') && t.length > 1) {
      const q = t.slice(1);
      const cat =
        categories.find((c) => c.name.toLowerCase() === q) ??
        categories.find((c) => c.name.toLowerCase().startsWith(q)) ??
        (() => {
          const area = areas.find((a) => a.name.toLowerCase().startsWith(q));
          return area ? categories.find((c) => c.area_id === area.id) : undefined;
        })();
      if (cat) {
        out.category_id = cat.id;
        continue;
      }
    }
    const pr = /^!(high|h|3|med|medium|m|2|low|l|1)$/.exec(t);
    if (pr) {
      out.priority = /^(high|h|3)$/.test(pr[1]) ? 3 : /^(med|medium|m|2)$/.test(pr[1]) ? 2 : 1;
      continue;
    }
    const dur = /^(?:(\d+)h)?(?:(\d+)m(?:in)?)?$/.exec(t);
    if (dur && (dur[1] || dur[2]) && t !== 'm') {
      out.duration_min = Number(dur[1] ?? 0) * 60 + Number(dur[2] ?? 0);
      continue;
    }
    if (['today', 'tdy'].includes(t)) { out.due_date = ymd(today); continue; }
    if (['tomorrow', 'tmr', 'tmrw', 'tom'].includes(t)) { out.due_date = ymd(addDays(today, 1)); continue; }
    const dow = DAYS.findIndex((d) => t === d || (t.length >= 3 && d.startsWith(t.slice(0, 3)) && /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|sday|urday)?$/.test(t)));
    if (dow >= 0) {
      const diff = (dow - today.getDay() + 7) % 7;
      out.due_date = ymd(addDays(today, diff));
      continue;
    }
    // "12 nov" / "nov 12"
    if (/^\d{1,2}$/.test(t) && next && monthIndex(next) >= 0 && /^[a-z]{3,9}$/.test(next)) {
      const d = futureDate(monthIndex(next), Number(t), today);
      if (d) { out.due_date = d; i++; continue; }
    }
    if (/^[a-z]{3,9}$/.test(t) && monthIndex(t) >= 0 && next && /^\d{1,2}$/.test(next)) {
      const d = futureDate(monthIndex(t), Number(next), today);
      if (d) { out.due_date = d; i++; continue; }
    }
    // "12/11" = 12 Nov (day/month)
    const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
    if (dm) {
      const d = futureDate(Number(dm[2]) - 1, Number(dm[1]), today);
      if (d) { out.due_date = d; continue; }
    }
    if (t === 'at' && next && parseTime(next)) continue;
    const time = parseTime(t);
    if (time) {
      out.due_time = time;
      continue;
    }
    keep.push(raw);
  }
  if (out.due_time && !out.due_date) out.due_date = ymd(today);
  out.title = keep.join(' ');
  return out;
}

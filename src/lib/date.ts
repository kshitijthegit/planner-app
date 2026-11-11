// Date helpers in the device's local timezone.

export const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60000);
}

/** Monday-based week start. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDayLong(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function fmtDayShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "YYYY-MM-DDTHH:MM" for <input type="datetime-local"> */
export function toLocalInput(d: Date): string {
  return `${ymd(d)}T${fmtTime(d)}`;
}

export function fromLocalInput(s: string): Date {
  const [date, time] = s.split('T');
  const d = parseYmd(date);
  const [h, m] = (time || '00:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function relativeDay(dateStr: string, today = ymd(new Date())): string {
  if (dateStr === today) return 'Today';
  const t = parseYmd(today);
  if (dateStr === ymd(addDays(t, 1))) return 'Tomorrow';
  if (dateStr === ymd(addDays(t, -1))) return 'Yesterday';
  const d = parseYmd(dateStr);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

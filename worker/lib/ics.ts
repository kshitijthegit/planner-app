// ICS feed parsing (e.g. published Outlook calendar), with recurrence expansion via ical.js.
import ICAL from 'ical.js';
import type { ExtEvent } from './google';
import { zonedToUtc } from './time';

type ITime = InstanceType<typeof ICAL.Time>;
type IComponent = InstanceType<typeof ICAL.Component>;

function timeToStored(t: ITime, tz: string): string {
  if (t.isDate) return t.toString().slice(0, 10);
  const zone = t.zone as { tzid?: string } | undefined;
  if (!zone || zone.tzid === 'floating') {
    const pad = (n: number) => String(n).padStart(2, '0');
    return zonedToUtc(`${t.year}-${pad(t.month)}-${pad(t.day)}`, `${pad(t.hour)}:${pad(t.minute)}`, tz).toISOString();
  }
  return t.toJSDate().toISOString();
}

function sortKey(stored: string): number {
  return stored.length === 10 ? Date.parse(`${stored}T00:00:00Z`) : Date.parse(stored);
}

export function parseIcs(text: string, tz: string, from: Date, to: Date): ExtEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      /* malformed timezone — times fall back to the app timezone */
    }
  }

  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map<string, IComponent>();
  const exceptions = new Map<string, IComponent[]>();
  for (const ve of vevents) {
    const uid = String(ve.getFirstPropertyValue('uid') ?? crypto.randomUUID());
    if (ve.hasProperty('recurrence-id')) {
      const list = exceptions.get(uid) ?? [];
      list.push(ve);
      exceptions.set(uid, list);
    } else {
      masters.set(uid, ve);
    }
  }

  const out: ExtEvent[] = [];
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const pushOcc = (uid: string, id: string, start: ITime, end: ITime, item: InstanceType<typeof ICAL.Event>) => {
    if (String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return;
    const s = timeToStored(start, tz);
    const e = timeToStored(end ?? start, tz);
    if (sortKey(e) < fromMs || sortKey(s) > toMs) return;
    out.push({
      ext_id: id,
      series_id: uid,
      title: item.summary || '(no title)',
      start_at: s,
      end_at: e,
      all_day: start.isDate ? 1 : 0,
      location: item.location || '',
    });
  };

  for (const [uid, ve] of masters) {
    const ev = new ICAL.Event(ve, { strictExceptions: true, exceptions: exceptions.get(uid) ?? [] });
    if (!ev.isRecurring()) {
      pushOcc(uid, uid, ev.startDate, ev.endDate, ev);
      continue;
    }
    const it = ev.iterator();
    let guard = 0;
    for (let next = it.next(); next && guard < 5000; next = it.next(), guard++) {
      if (sortKey(timeToStored(next, tz)) > toMs) break;
      const d = ev.getOccurrenceDetails(next);
      pushOcc(uid, `${uid}:${next.toString()}`, d.startDate, d.endDate, d.item);
    }
  }

  // Exceptions whose master is missing: treat as standalone events.
  for (const [uid, list] of exceptions) {
    if (masters.has(uid)) continue;
    for (const ve of list) {
      const ev = new ICAL.Event(ve);
      pushOcc(uid, `${uid}:${ev.startDate.toString()}`, ev.startDate, ev.endDate, ev);
    }
  }
  return out;
}

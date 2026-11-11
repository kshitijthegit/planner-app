import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';
import { localParts, zonedToUtc } from './time';

// Shape of a published Outlook calendar: Windows TZID + VTIMEZONE, weekly class with an EXDATE and a moved occurrence.
const OUTLOOK = `BEGIN:VCALENDAR
METHOD:PUBLISH
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Singapore Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:lec-1
SUMMARY:Lecture - Finite Element Methods
DTSTART;TZID=Singapore Standard Time:20261104T150000
DTEND;TZID=Singapore Standard Time:20261104T170000
RRULE:FREQ=WEEKLY;UNTIL=20261202T070000Z;INTERVAL=1;BYDAY=WE
EXDATE;TZID=Singapore Standard Time:20261118T150000
LOCATION:LT7
END:VEVENT
BEGIN:VEVENT
UID:lec-1
RECURRENCE-ID;TZID=Singapore Standard Time:20261125T150000
SUMMARY:Lecture - Finite Element Methods (moved)
DTSTART;TZID=Singapore Standard Time:20261126T100000
DTEND;TZID=Singapore Standard Time:20261126T120000
END:VEVENT
BEGIN:VEVENT
UID:hol-1
SUMMARY:Reading week
DTSTART;VALUE=DATE:20261116
DTEND;VALUE=DATE:20261121
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART:20261112T010000Z
DTEND:20261112T020000Z
END:VEVENT
END:VCALENDAR`;

describe('parseIcs', () => {
  const from = new Date('2026-11-01T00:00:00Z');
  const to = new Date('2026-12-31T00:00:00Z');
  const events = parseIcs(OUTLOOK, 'Asia/Singapore', from, to);
  const lectures = events.filter((e) => e.series_id === 'lec-1').sort((a, b) => a.start_at.localeCompare(b.start_at));

  it('expands weekly recurrence, honours EXDATE and UNTIL', () => {
    // 4, 11, (18 excluded), 25→26 moved, 2 Dec
    expect(lectures.map((e) => e.start_at)).toEqual([
      '2026-11-04T07:00:00.000Z',
      '2026-11-11T07:00:00.000Z',
      '2026-11-26T02:00:00.000Z',
      '2026-12-02T07:00:00.000Z',
    ]);
  });

  it('applies the moved occurrence title', () => {
    expect(lectures[2].title).toContain('(moved)');
    expect(lectures[0].location).toBe('LT7');
  });

  it('keeps all-day events as dates and drops cancelled ones', () => {
    const hol = events.find((e) => e.series_id === 'hol-1')!;
    expect(hol).toMatchObject({ all_day: 1, start_at: '2026-11-16', end_at: '2026-11-21' });
    expect(events.find((e) => e.series_id === 'cancelled-1')).toBeUndefined();
  });

  it('treats unknown/floating times as the app timezone', () => {
    const floating = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:f1\nSUMMARY:Floating\nDTSTART:20261111T090000\nDTEND:20261111T100000\nEND:VEVENT\nEND:VCALENDAR`;
    const [e] = parseIcs(floating, 'Asia/Singapore', from, to);
    expect(e.start_at).toBe('2026-11-11T01:00:00.000Z');
  });
});

describe('time helpers', () => {
  it('converts wall clock to UTC and back', () => {
    const d = zonedToUtc('2026-11-11', '08:00', 'Asia/Singapore');
    expect(d.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(localParts(d, 'Asia/Singapore')).toMatchObject({ date: '2026-11-11', time: '08:00', minutes: 480, weekday: 3 });
  });
  it('handles DST zones', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'Europe/London').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
});

// Tests for the Gmail add-on's email parser (gmail-addon/Parse.gs is plain JS loaded as a script).
import { describe, expect, it } from 'vitest';
import src from '../../gmail-addon/Parse.gs?raw';

const { parseEmail } = new Function(`${src}; return { parseEmail };`)() as {
  parseEmail: (s: string, b: string, r: Date) => { title: string; date: string | null; time: string | null; endTime: string | null; location: string };
};
const thu = new Date(2026, 10, 12, 9, 0); // Thu 12 Nov 2026, local

describe('gmail parseEmail', () => {
  it('reads a Google invitation subject', () => {
    const r = parseEmail('Invitation: Design review @ Thu 19 Nov 2026 3pm - 4:30pm (SGT) (kj@x.com)', '', thu);
    expect(r).toMatchObject({ title: 'Design review', date: '2026-11-19', time: '15:00', endTime: '16:30' });
  });
  it('finds date, time and venue in the body', () => {
    const r = parseEmail('Re: Fwd: Alumni dinner', 'Join us on Saturday, 5 December at 7.30pm.\nVenue: Raffles Hotel\nThanks', thu);
    expect(r).toMatchObject({ title: 'Alumni dinner', date: '2026-12-05', time: '19:30', endTime: null, location: 'Raffles Hotel' });
  });
  it('day-first numeric dates and 24h times', () => {
    expect(parseEmail('Seminar', 'Date: 03/02/2027, 14:00 - 15:30', thu)).toMatchObject({ date: '2027-02-03', time: '14:00', endTime: '15:30' });
  });
  it('month-first dates without a year roll to next year when long past', () => {
    expect(parseEmail('Kickoff Jan 8', '', thu).date).toBe('2027-01-08');
    expect(parseEmail('Recap Nov 2', '', thu).date).toBe('2026-11-02');
  });
  it('relative days', () => {
    expect(parseEmail('Lunch tomorrow at noon', '', thu)).toMatchObject({ date: '2026-11-13', time: '12:00' });
    expect(parseEmail('Catch up', 'Free next Monday 3-5pm?', thu)).toMatchObject({ date: '2026-11-16', time: '15:00', endTime: '17:00' });
  });
  it('no date found', () => {
    expect(parseEmail('Newsletter', 'Hello there, 2-3 days shipping', thu)).toMatchObject({ date: null, time: null });
  });
  it('11-1pm range starts in the morning', () => {
    expect(parseEmail('Workshop 20 Nov 11-1pm', '', thu)).toMatchObject({ time: '11:00', endTime: '13:00' });
  });
});

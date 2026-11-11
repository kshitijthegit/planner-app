import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickadd';

const areas = [
  { id: 'a-uni', name: 'Uni', color: '#000000', sort: 0 },
  { id: 'a-p', name: 'Personal', color: '#000000', sort: 1 },
];
const cats = [
  { id: 'c-classes', area_id: 'a-uni', name: 'Classes', color: '#000000', sort: 0 },
  { id: 'c-asg', area_id: 'a-uni', name: 'Assignments', color: '#000000', sort: 1 },
  { id: 'c-chores', area_id: 'a-p', name: 'Chores', color: '#000000', sort: 0 },
];
const wed = new Date(2026, 10, 11, 14, 0); // Wed 11 Nov 2026

describe('parseQuickAdd', () => {
  it('parses category, priority, weekday, time and duration', () => {
    expect(parseQuickAdd('laundry sat 10am #chores !high 30m', cats, areas, wed)).toEqual({
      title: 'laundry',
      category_id: 'c-chores',
      priority: 3,
      due_date: '2026-11-14',
      due_time: '10:00',
      duration_min: 30,
    });
  });
  it('handles tomorrow, 24h time, prefix category', () => {
    const r = parseQuickAdd('Submit FEM report tmr 17:30 #assign', cats, areas, wed);
    expect(r).toMatchObject({ title: 'Submit FEM report', category_id: 'c-asg', due_date: '2026-11-12', due_time: '17:30' });
  });
  it('maps area tag to its first category', () => {
    expect(parseQuickAdd('read paper #uni', cats, areas, wed).category_id).toBe('c-classes');
  });
  it('parses day-month dates and rolls into next year', () => {
    expect(parseQuickAdd('dentist 3 dec', cats, areas, wed).due_date).toBe('2026-12-03');
    expect(parseQuickAdd('tax nov 2', cats, areas, wed).due_date).toBe('2027-11-02');
    expect(parseQuickAdd('pay rent 1/12', cats, areas, wed).due_date).toBe('2026-12-01');
  });
  it('same weekday means today; time alone means today', () => {
    expect(parseQuickAdd('gym wed', cats, areas, wed).due_date).toBe('2026-11-11');
    expect(parseQuickAdd('call mom at 8pm', cats, areas, wed)).toMatchObject({ title: 'call mom', due_date: '2026-11-11', due_time: '20:00' });
  });
  it('leaves plain words and numbers alone', () => {
    expect(parseQuickAdd('buy 2 monitors #unknown', cats, areas, wed)).toMatchObject({ title: 'buy 2 monitors #unknown', category_id: null, due_date: null });
    expect(parseQuickAdd('1h30m deep work', cats, areas, wed)).toMatchObject({ title: 'deep work', duration_min: 90 });
  });
});

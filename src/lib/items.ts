// Turn events, tasks and goals into one list of calendar items, and lay overlapping items out in lanes.
//   events → filled blocks (all-day events also paint the whole day white)
//   tasks  → thin blocks with a check; untimed tasks sit at the top of their day
//   goals  → unfilled blocks at the top of each day they cover
import type { CalEvent, Goal, Task } from '../api';
import { addDays, addMinutes, parseYmd, sameDay, startOfDay } from './date';

export interface Item {
  key: string;
  kind: 'own' | 'ext' | 'task' | 'goal';
  title: string;
  start: Date;
  end: Date;
  allDay: boolean; // true = shown in the top-of-day row
  categoryId: string | null;
  areaId: string | null; // explicit area (category's area is resolved by the caller)
  done: boolean;
  event?: CalEvent;
  task?: Task;
  goal?: Goal;
}

export function eventToItem(e: CalEvent): Item {
  const allDay = !!e.all_day;
  return {
    key: e.kind === 'own' ? `own:${e.id}` : `ext:${e.source_id}:${e.ext_id}`,
    kind: e.kind,
    title: e.title,
    start: allDay ? parseYmd(e.start_at) : new Date(e.start_at),
    end: allDay ? parseYmd(e.end_at) : new Date(e.end_at),
    allDay,
    categoryId: e.category_id,
    areaId: e.area_id ?? null,
    done: false,
    event: e,
  };
}

/** A task on the calendar: its time block, else its due time, else (untimed) the top of its due day. */
export function taskToItem(t: Task): Item | null {
  const base = { key: `task:${t.id}`, kind: 'task' as const, title: t.title, categoryId: t.category_id, areaId: t.area_id ?? null, done: !!t.done_at, task: t };
  if (t.scheduled_start) {
    const start = new Date(t.scheduled_start);
    return { ...base, start, end: addMinutes(start, t.duration_min || 60), allDay: false };
  }
  if (t.due_date && t.due_time) {
    const start = parseYmd(t.due_date);
    const [h, m] = t.due_time.split(':').map(Number);
    start.setHours(h, m);
    return { ...base, start, end: addMinutes(start, t.duration_min || 30), allDay: false };
  }
  if (t.due_date) {
    const start = parseYmd(t.due_date);
    return { ...base, start, end: addDays(start, 1), allDay: true };
  }
  return null;
}

export function goalToItem(g: Goal): Item {
  return {
    key: `goal:${g.id}`,
    kind: 'goal',
    title: g.title,
    start: parseYmd(g.start_date),
    end: addDays(parseYmd(g.end_date), 1),
    allDay: true,
    categoryId: g.category_id,
    areaId: g.area_id,
    done: !!g.done_at,
    goal: g,
  };
}

export function buildItems(events: CalEvent[], tasks: Task[], goals: Goal[] = []): Item[] {
  const items = events.map(eventToItem);
  for (const t of tasks) {
    const it = taskToItem(t);
    if (it) items.push(it);
  }
  for (const g of goals) items.push(goalToItem(g));
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Items touching a given local day. All-day items use [start, end) dates. */
export function itemsOnDay(items: Item[], day: Date): Item[] {
  const s = startOfDay(day);
  const e = addDays(s, 1);
  return items.filter((it) =>
    it.allDay ? it.start <= s && it.end > s : (it.start < e && it.end > s) || sameDay(it.start, s),
  );
}

/** Order for the top-of-day row: all-day events, then goals, then tasks. */
export function topRowOrder(a: Item, b: Item): number {
  const rank = (i: Item) => (i.kind === 'goal' ? 1 : i.kind === 'task' ? 2 : 0);
  return rank(a) - rank(b) || a.title.localeCompare(b.title);
}

/** A day is "blocked out" (white background) when an all-day event covers it. */
export function isWholeDay(items: Item[], day: Date): boolean {
  return itemsOnDay(items, day).some((i) => i.allDay && (i.kind === 'own' || i.kind === 'ext'));
}

export interface Placed {
  item: Item;
  lane: number;
  lanes: number;
}

/** Greedy lane assignment within clusters of overlapping items. */
export function layoutLanes(items: Item[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const n = laneEnds.length;
    for (const p of cluster) p.lanes = n;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const st = item.start.getTime();
    const en = Math.max(item.end.getTime(), st + 15 * 60000);
    if (st >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= st);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(en);
    } else laneEnds[lane] = en;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd === -Infinity ? en : clusterEnd, en);
  }
  if (cluster.length) flush();
  return out;
}

/** Readable text colour on a filled background. */
export function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.3 ? '#1B120B' : '#F3EBDD';
}

/** A colour usable as text/lines on the dark green background (dark area colours fall back to crema). */
export function onDark(hex: string): string {
  return textOn(hex) === '#F3EBDD' ? '#EADBC4' : hex;
}

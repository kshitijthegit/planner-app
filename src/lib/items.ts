// Turn events + time-blocked tasks into one list of calendar items, and lay overlapping items out in lanes.
import type { CalEvent, Task } from '../api';
import { addMinutes, parseYmd, sameDay, startOfDay, addDays } from './date';

export interface Item {
  key: string;
  kind: 'own' | 'ext' | 'task';
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  categoryId: string | null;
  event?: CalEvent;
  task?: Task;
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
    event: e,
  };
}

export function taskToItem(t: Task): Item | null {
  if (!t.scheduled_start) return null;
  const start = new Date(t.scheduled_start);
  return {
    key: `task:${t.id}`,
    kind: 'task',
    title: t.title,
    start,
    end: addMinutes(start, t.duration_min || 60),
    allDay: false,
    categoryId: t.category_id,
    task: t,
  };
}

export function buildItems(events: CalEvent[], tasks: Task[]): Item[] {
  const items = events.map(eventToItem);
  for (const t of tasks) {
    if (t.parent_id) continue;
    const it = taskToItem(t);
    if (it) items.push(it);
  }
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

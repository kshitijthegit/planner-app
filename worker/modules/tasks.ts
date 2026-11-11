import { all, first, HttpError, json, nowIso, patchRow, readJson, run, str, uuid, type Env } from '../lib/core';
import { getSettings } from '../lib/settings';
import { addDaysIso, addMonthsIso, localParts } from '../lib/time';
import type { BackendModule } from './types';

export interface TaskRow {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
  area_id: string | null;
  priority: number;
  due_date: string | null;
  due_time: string | null;
  duration_min: number | null;
  scheduled_start: string | null;
  recurrence: string | null;
  parent_id: string | null;
  top3_date: string | null;
  reminder_min: number | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  sort: number;
}

const FIELDS = [
  'title', 'notes', 'category_id', 'area_id', 'priority', 'due_date', 'due_time', 'duration_min',
  'scheduled_start', 'recurrence', 'parent_id', 'top3_date', 'reminder_min', 'sort',
];
const RECURRENCES = ['daily', 'weekdays', 'weekly', 'monthly'];
/** Custom repeat, e.g. "every:3:day", "every:2:week", "every:6:month". */
export const CUSTOM_RECURRENCE = /^every:([1-9]\d{0,2}):(day|week|month)$/;

export function validPriority(p: unknown) {
  if (p != null && !(Number.isInteger(p) && (p as number) >= 0 && (p as number) <= 9)) throw new HttpError(400, 'priority must be 0-9');
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(b: Record<string, unknown>, creating: boolean) {
  if (creating || b.title !== undefined) str(b.title, 'title', { max: 300 });
  if (b.notes != null && typeof b.notes !== 'string') throw new HttpError(400, 'notes must be a string');
  for (const k of ['due_date', 'top3_date'])
    if (b[k] != null && (typeof b[k] !== 'string' || !DATE.test(b[k] as string))) throw new HttpError(400, `${k} must be YYYY-MM-DD`);
  if (b.due_time != null && (typeof b.due_time !== 'string' || !TIME.test(b.due_time))) throw new HttpError(400, 'due_time must be HH:MM');
  if (b.scheduled_start != null && (typeof b.scheduled_start !== 'string' || isNaN(Date.parse(b.scheduled_start))))
    throw new HttpError(400, 'scheduled_start must be an ISO date-time');
  if (b.recurrence != null && !RECURRENCES.includes(b.recurrence as string) && !CUSTOM_RECURRENCE.test(String(b.recurrence)))
    throw new HttpError(400, 'bad recurrence');
  validPriority(b.priority);
  for (const k of ['duration_min', 'reminder_min'])
    if (b[k] != null && (!Number.isInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > 100000))
      throw new HttpError(400, `${k} must be a whole number`);
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

export const MAX_SUBTASK_DEPTH = 2;

/** Depth of a task: 0 = top-level, 1 = subtask, 2 = sub-subtask. */
async function depthOf(env: Env, id: string): Promise<number> {
  let depth = 0;
  let cur = await first<{ parent_id: string | null }>(env, 'SELECT parent_id FROM tasks WHERE id = ?', id);
  if (!cur) throw new HttpError(400, 'Parent task not found');
  while (cur?.parent_id && depth < 5) {
    depth++;
    cur = await first<{ parent_id: string | null }>(env, 'SELECT parent_id FROM tasks WHERE id = ?', cur.parent_id);
  }
  return depth;
}

async function checkParent(env: Env, parentId: unknown, selfId?: string) {
  if (parentId == null) return;
  if (typeof parentId !== 'string') throw new HttpError(400, 'parent_id must be a string');
  if (parentId === selfId) throw new HttpError(400, 'A task cannot be its own subtask');
  if ((await depthOf(env, parentId)) + 1 > MAX_SUBTASK_DEPTH)
    throw new HttpError(400, `Subtasks can only go ${MAX_SUBTASK_DEPTH} levels deep`);
  if (selfId) {
    const kids = await first<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM tasks WHERE parent_id = ?', selfId);
    if (kids && kids.n > 0 && (await depthOf(env, parentId)) + 2 > MAX_SUBTASK_DEPTH)
      throw new HttpError(400, `Moving this task would nest subtasks more than ${MAX_SUBTASK_DEPTH} levels deep`);
  }
}

async function getTask(env: Env, id: string): Promise<TaskRow> {
  const t = await first<TaskRow>(env, 'SELECT * FROM tasks WHERE id = ?', id);
  if (!t) throw new HttpError(404, 'Task not found');
  return t;
}

export const tasksModule: BackendModule = {
  id: 'tasks',
  register(r) {
    // Open tasks + anything completed in the last 14 days.
    r.get('/api/tasks', async ({ env }) => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      return json(await all<TaskRow>(env, 'SELECT * FROM tasks WHERE done_at IS NULL OR done_at >= ? ORDER BY sort, created_at', since));
    });

    r.post('/api/tasks', async ({ env, req }) => {
      const b = await readJson(req);
      validate(b, true);
      await checkParent(env, b.parent_id);
      const id = uuid();
      const now = nowIso();
      const row: Record<string, unknown> = { id, created_at: now, updated_at: now, notes: '', priority: 0, sort: 0 };
      for (const k of FIELDS) if (b[k] !== undefined) row[k] = b[k];
      const keys = Object.keys(row);
      await run(env, `INSERT INTO tasks (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => row[k] ?? null));
      return json(await getTask(env, id), 201);
    });

    r.patch('/api/tasks/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      validate(b, false);
      await getTask(env, params.id);
      if (b.parent_id !== undefined) await checkParent(env, b.parent_id, params.id);
      await patchRow(env, 'tasks', params.id, b, FIELDS, { updated_at: nowIso() });
      return json(await getTask(env, params.id));
    });

    r.delete('/api/tasks/:id', async ({ env, params }) => {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM tasks WHERE parent_id IN (SELECT id FROM tasks WHERE parent_id = ?)').bind(params.id),
        env.DB.prepare('DELETE FROM tasks WHERE parent_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(params.id),
      ]);
      return json({ ok: true });
    });

    r.post('/api/tasks/:id/complete', async ({ env, params }) => {
      const t = await getTask(env, params.id);
      if (t.done_at) return json({ task: t });
      const now = nowIso();
      await run(env, 'UPDATE tasks SET done_at = ?, updated_at = ? WHERE id = ?', now, now, t.id);
      let next: TaskRow | null = null;
      if (t.recurrence) {
        const settings = await getSettings(env);
        const base = t.due_date ?? localParts(new Date(), settings.timezone).date;
        const id = uuid();
        await run(
          env,
          `INSERT INTO tasks (id, title, notes, category_id, area_id, priority, due_date, due_time, duration_min, recurrence, reminder_min, created_at, updated_at, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, t.title, t.notes, t.category_id, t.area_id, t.priority, nextDue(base, t.recurrence), t.due_time, t.duration_min,
          t.recurrence, t.reminder_min, now, now, t.sort,
        );
        next = await getTask(env, id);
      }
      return json({ task: await getTask(env, t.id), next });
    });

    r.post('/api/tasks/:id/reopen', async ({ env, params }) => {
      await run(env, 'UPDATE tasks SET done_at = NULL, updated_at = ? WHERE id = ?', nowIso(), params.id);
      return json(await getTask(env, params.id));
    });
  },
};

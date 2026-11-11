import { all, first, HttpError, json, nowIso, patchRow, readJson, run, str, uuid, type Env } from '../lib/core';
import { getSettings } from '../lib/settings';
import { addDaysIso, addMonthsIso, localParts } from '../lib/time';
import type { BackendModule } from './types';

export interface TaskRow {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
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
  'title', 'notes', 'category_id', 'priority', 'due_date', 'due_time', 'duration_min',
  'scheduled_start', 'recurrence', 'parent_id', 'top3_date', 'reminder_min', 'sort',
];
const RECURRENCES = ['daily', 'weekdays', 'weekly', 'monthly'];
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
  if (b.recurrence != null && !RECURRENCES.includes(b.recurrence as string)) throw new HttpError(400, 'bad recurrence');
  if (b.priority != null && ![0, 1, 2, 3].includes(Number(b.priority))) throw new HttpError(400, 'priority must be 0-3');
  for (const k of ['duration_min', 'reminder_min'])
    if (b[k] != null && (!Number.isInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > 100000))
      throw new HttpError(400, `${k} must be a whole number`);
}

function nextDue(date: string, rule: string): string {
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
      await patchRow(env, 'tasks', params.id, b, FIELDS, { updated_at: nowIso() });
      return json(await getTask(env, params.id));
    });

    r.delete('/api/tasks/:id', async ({ env, params }) => {
      await env.DB.batch([
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
          `INSERT INTO tasks (id, title, notes, category_id, priority, due_date, due_time, duration_min, recurrence, reminder_min, created_at, updated_at, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, t.title, t.notes, t.category_id, t.priority, nextDue(base, t.recurrence), t.due_time, t.duration_min,
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

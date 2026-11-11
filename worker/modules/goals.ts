// Goals: things to aim for on a day or across a date range (shown at the top of each day, unfilled).
import { all, first, HttpError, json, nowIso, patchRow, readJson, run, str, uuid, type Env } from '../lib/core';
import { validPriority } from './tasks';
import type { BackendModule } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ['title', 'notes', 'area_id', 'category_id', 'priority', 'start_date', 'end_date', 'done_at'];

function validate(b: Record<string, unknown>, creating: boolean) {
  if (creating || b.title !== undefined) str(b.title, 'title', { max: 300 });
  for (const k of ['start_date', 'end_date']) {
    if (creating && b[k] == null) throw new HttpError(400, `${k} is required`);
    if (b[k] != null && (typeof b[k] !== 'string' || !DATE.test(b[k] as string))) throw new HttpError(400, `${k} must be YYYY-MM-DD`);
  }
  if (b.start_date && b.end_date && (b.end_date as string) < (b.start_date as string)) throw new HttpError(400, 'end date must be on or after start date');
  if (b.done_at != null && (typeof b.done_at !== 'string' || isNaN(Date.parse(b.done_at)))) throw new HttpError(400, 'done_at must be a date');
  validPriority(b.priority);
}

async function getGoal(env: Env, id: string) {
  const g = await first(env, 'SELECT * FROM goals WHERE id = ?', id);
  if (!g) throw new HttpError(404, 'Goal not found');
  return g;
}

export const goalsModule: BackendModule = {
  id: 'goals',
  register(r) {
    // Open goals + goals finished in the last 30 days.
    r.get('/api/goals', async ({ env }) => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      return json(await all(env, 'SELECT * FROM goals WHERE done_at IS NULL OR done_at >= ? ORDER BY start_date, priority DESC', since));
    });
    r.post('/api/goals', async ({ env, req }) => {
      const b = await readJson(req);
      validate(b, true);
      const id = uuid();
      const now = nowIso();
      await run(
        env,
        `INSERT INTO goals (id, title, notes, area_id, category_id, priority, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, b.title, b.notes ?? '', b.area_id ?? null, b.category_id ?? null, b.priority ?? 0, b.start_date, b.end_date, now, now,
      );
      return json(await getGoal(env, id), 201);
    });
    r.patch('/api/goals/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      validate(b, false);
      await getGoal(env, params.id);
      await patchRow(env, 'goals', params.id, b, FIELDS, { updated_at: nowIso() });
      return json(await getGoal(env, params.id));
    });
    r.delete('/api/goals/:id', async ({ env, params }) => {
      await run(env, 'DELETE FROM goals WHERE id = ?', params.id);
      return json({ ok: true });
    });
  },
};

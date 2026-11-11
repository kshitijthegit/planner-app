import { all, first, HttpError, json, nowIso, patchRow, readJson, run, str, uuid, type Env } from '../lib/core';
import type { BackendModule } from './types';

const FIELDS = ['title', 'notes', 'category_id', 'start_at', 'end_at', 'all_day', 'location', 'reminder_min'];

function validate(b: Record<string, unknown>, creating: boolean) {
  if (creating || b.title !== undefined) str(b.title, 'title', { max: 300 });
  for (const k of ['start_at', 'end_at']) {
    if (creating && b[k] == null) throw new HttpError(400, `${k} is required`);
    if (b[k] != null && (typeof b[k] !== 'string' || isNaN(Date.parse(b[k] as string)))) throw new HttpError(400, `${k} must be a date`);
  }
  if (b.start_at && b.end_at && Date.parse(b.end_at as string) < Date.parse(b.start_at as string))
    throw new HttpError(400, 'end must be after start');
}

async function getEvent(env: Env, id: string) {
  const e = await first(env, 'SELECT * FROM events WHERE id = ?', id);
  if (!e) throw new HttpError(404, 'Event not found');
  return e;
}

export const eventsModule: BackendModule = {
  id: 'events',
  register(r) {
    /** Everything on the calendar between from and to: own events + synced (read-only) events. */
    r.get('/api/agenda', async ({ env, url }) => {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) throw new HttpError(400, 'from and to are required');
      // All-day rows store YYYY-MM-DD; widen by a day so string comparison never drops them.
      const lo = new Date(Date.parse(from) - 86400000).toISOString();
      const hi = new Date(Date.parse(to) + 86400000).toISOString();
      const own = await all(env, 'SELECT *, \'own\' AS kind FROM events WHERE start_at < ? AND end_at > ? ORDER BY start_at', hi, lo.slice(0, 10));
      const ext = await all(
        env,
        `SELECT e.source_id, e.ext_id, e.series_id, e.title, e.start_at, e.end_at, e.all_day, e.location,
                COALESCE(o.category_id, s.category_id) AS category_id, s.name AS source_name, s.kind AS source_kind, 'ext' AS kind
         FROM ext_events e JOIN sources s ON s.id = e.source_id AND s.enabled = 1
         LEFT JOIN ext_overrides o ON o.source_id = e.source_id AND o.series_id = e.series_id
         WHERE e.start_at < ? AND e.end_at > ? ORDER BY e.start_at`,
        hi,
        lo.slice(0, 10),
      );
      return json({ events: [...own, ...ext] });
    });

    r.post('/api/events', async ({ env, req }) => {
      const b = await readJson(req);
      validate(b, true);
      const id = uuid();
      const now = nowIso();
      await run(
        env,
        `INSERT INTO events (id, title, notes, category_id, start_at, end_at, all_day, location, reminder_min, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, b.title, b.notes ?? '', b.category_id ?? null, b.start_at, b.end_at, b.all_day ? 1 : 0,
        b.location ?? '', b.reminder_min ?? null, now, now,
      );
      return json(await getEvent(env, id), 201);
    });

    r.patch('/api/events/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      validate(b, false);
      await getEvent(env, params.id);
      await patchRow(env, 'events', params.id, b, FIELDS, { updated_at: nowIso() });
      return json(await getEvent(env, params.id));
    });

    r.delete('/api/events/:id', async ({ env, params }) => {
      await run(env, 'DELETE FROM events WHERE id = ?', params.id);
      return json({ ok: true });
    });

    /** Re-categorise a synced event series (e.g. all "FEM Lecture" occurrences). */
    r.put('/api/ext-overrides', async ({ env, req }) => {
      const b = await readJson(req);
      const source = str(b.source_id, 'source_id')!;
      const series = str(b.series_id, 'series_id')!;
      if (b.category_id == null) {
        await run(env, 'DELETE FROM ext_overrides WHERE source_id = ? AND series_id = ?', source, series);
      } else {
        await run(
          env,
          `INSERT INTO ext_overrides (source_id, series_id, category_id) VALUES (?, ?, ?)
           ON CONFLICT(source_id, series_id) DO UPDATE SET category_id = excluded.category_id`,
          source, series, str(b.category_id, 'category_id'),
        );
      }
      return json({ ok: true });
    });
  },
};

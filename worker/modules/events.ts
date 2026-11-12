import { all, first, HttpError, json, nowIso, patchRow, readJson, restorableId, run, str, type Env } from '../lib/core';
import { occurrences, validRecurrence, type SeriesRow } from '../lib/recur';
import { getSettings } from '../lib/settings';
import { addDaysIso, localParts } from '../lib/time';
import { goalsBetween, loadOverrides } from './occurrences';
import type { BackendModule } from './types';
import { validPriority } from './tasks';

const FIELDS = ['title', 'notes', 'category_id', 'area_id', 'priority', 'start_at', 'end_at', 'all_day', 'location', 'reminder_min', 'attendance', 'recurrence', 'recur_until', 'task_id'];
const ATTENDANCE = ['yes', 'no', 'maybe'];

function validate(b: Record<string, unknown>, creating: boolean) {
  if (creating || b.title !== undefined) str(b.title, 'title', { max: 300 });
  for (const k of ['start_at', 'end_at']) {
    if (creating && b[k] == null) throw new HttpError(400, `${k} is required`);
    if (b[k] != null && (typeof b[k] !== 'string' || isNaN(Date.parse(b[k] as string)))) throw new HttpError(400, `${k} must be a date`);
  }
  validPriority(b.priority);
  if (b.attendance != null && !ATTENDANCE.includes(b.attendance as string)) throw new HttpError(400, 'attendance must be yes, no or maybe');
  if (!validRecurrence(b.recurrence)) throw new HttpError(400, 'bad repeat');
  if (b.recur_until != null && (typeof b.recur_until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.recur_until))) throw new HttpError(400, 'repeat-until must be YYYY-MM-DD');
  if (b.start_at && b.end_at && Date.parse(b.end_at as string) < Date.parse(b.start_at as string))
    throw new HttpError(400, 'end must be after start');
}

async function getEvent(env: Env, id: string) {
  const e = await first(env, 'SELECT * FROM events WHERE id = ?', id);
  if (!e) throw new HttpError(404, 'Event not found');
  return e;
}

type OwnRow = SeriesRow & Record<string, unknown> & { id: string };

/**
 * Own events overlapping [fromMs, toMs), with recurring series expanded into occurrences.
 * Occurrences keep the series' id and carry series_start_at / series_end_at so the editor edits the series.
 */
export async function ownEventsBetween(env: Env, fromMs: number, toMs: number, tz: string): Promise<OwnRow[]> {
  const lo = new Date(fromMs - 86400000).toISOString();
  const hi = new Date(toMs + 86400000).toISOString();
  const single = await all<OwnRow>(env, `SELECT *, 'own' AS kind FROM events WHERE recurrence IS NULL AND start_at < ? AND end_at > ? ORDER BY start_at`, hi, lo.slice(0, 10));
  const series = await all<OwnRow>(
    env,
    `SELECT *, 'own' AS kind FROM events WHERE recurrence IS NOT NULL AND start_at < ? AND (recur_until IS NULL OR recur_until >= ?)`,
    hi, lo.slice(0, 10),
  );
  const ov = await loadOverrides(env, 'event', series.map((e) => e.id));
  const expanded = series.flatMap((ev) =>
    occurrences(ev, fromMs - 86400000, toMs + 86400000, tz).flatMap((o) => {
      const x = ov.get(`${ev.id}|${o.occ_date}`);
      if (x?.cancelled) return [];
      return [{ ...ev, ...o, ...(x?.data ?? {}), occ_date: o.occ_date, series_start_at: ev.start_at, series_end_at: ev.end_at, overridden: !!x, override: x ?? null } as OwnRow];
    }),
  );
  return [...single, ...expanded];
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
      const own = await ownEventsBetween(env, Date.parse(from), Date.parse(to), (await getSettings(env)).timezone);
      const ext = await all(
        env,
        `SELECT e.source_id, e.ext_id, e.series_id, e.title, e.start_at, e.end_at, e.all_day, e.location, e.event_type,
                COALESCE(o.category_id, s.category_id) AS category_id, NULL AS area_id, 0 AS priority,
                COALESCE(a.attendance, 'yes') AS attendance, s.name AS source_name, s.kind AS source_kind, 'ext' AS kind
         FROM ext_events e JOIN sources s ON s.id = e.source_id AND s.enabled = 1
         LEFT JOIN ext_overrides o ON o.source_id = e.source_id AND o.series_id = e.series_id
         LEFT JOIN ext_attendance a ON a.source_id = e.source_id AND a.ext_id = e.ext_id
         WHERE e.start_at < ? AND e.end_at > ? ORDER BY e.start_at`,
        hi,
        lo.slice(0, 10),
      );
      const tz = (await getSettings(env)).timezone;
      const goals = await goalsBetween(env, addDaysIso(localParts(new Date(from), tz).date, -1), addDaysIso(localParts(new Date(to), tz).date, 1), tz);
      return json({ events: [...own, ...ext], goals });
    });

    r.post('/api/events', async ({ env, req }) => {
      const b = await readJson(req);
      validate(b, true);
      const id = await restorableId(env, 'events', b.id);
      const now = nowIso();
      await run(
        env,
        `INSERT INTO events (id, title, notes, category_id, area_id, priority, start_at, end_at, all_day, location, reminder_min,
           attendance, recurrence, recur_until, task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, b.title, b.notes ?? '', b.category_id ?? null, b.area_id ?? null, b.priority ?? 0, b.start_at, b.end_at, b.all_day ? 1 : 0,
        b.location ?? '', b.reminder_min ?? null, b.attendance ?? 'yes', b.recurrence ?? null, b.recur_until ?? null, b.task_id ?? null, now, now,
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

    /** Events created to work on a task. */
    r.get('/api/events/by-task/:id', async ({ env, params }) =>
      json(await all(env, "SELECT *, 'own' AS kind FROM events WHERE task_id = ? ORDER BY start_at", params.id)),
    );

    r.delete('/api/events/:id', async ({ env, params }) => {
      await env.DB.prepare("DELETE FROM occurrence_overrides WHERE kind = 'event' AND series_id = ?").bind(params.id).run();
      await run(env, 'DELETE FROM events WHERE id = ?', params.id);
      return json({ ok: true });
    });

    /** Planned attendance for one synced (read-only) event occurrence. */
    r.put('/api/ext-attendance', async ({ env, req }) => {
      const b = await readJson(req);
      const source = str(b.source_id, 'source_id')!;
      const ext = str(b.ext_id, 'ext_id')!;
      if (!ATTENDANCE.includes(b.attendance as string)) throw new HttpError(400, 'attendance must be yes, no or maybe');
      await run(
        env,
        `INSERT INTO ext_attendance (source_id, ext_id, attendance) VALUES (?, ?, ?)
         ON CONFLICT(source_id, ext_id) DO UPDATE SET attendance = excluded.attendance`,
        source, ext, b.attendance,
      );
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

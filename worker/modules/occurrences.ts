// Per-occurrence changes to repeating events and goals: edit one, cancel one, or (goals) achieve one,
// without touching the rest of the series.
import { all, HttpError, json, readJson, run, str, type Env } from '../lib/core';
import { occurrences } from '../lib/recur';
import { addDaysIso } from '../lib/time';
import type { BackendModule } from './types';

export type OccKind = 'event' | 'goal';

export interface Override {
  cancelled: number;
  done_at: string | null;
  data: Record<string, unknown>;
}

const EVENT_FIELDS = ['title', 'start_at', 'end_at', 'attendance', 'location', 'notes', 'priority', 'category_id', 'area_id', 'reminder_min'];
const GOAL_FIELDS = ['title', 'start_date', 'end_date', 'notes', 'priority', 'category_id', 'area_id'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Overrides for the given series, keyed "seriesId|occDate". */
export async function loadOverrides(env: Env, kind: OccKind, seriesIds: string[]): Promise<Map<string, Override>> {
  const map = new Map<string, Override>();
  if (!seriesIds.length) return map;
  const rows = await all<{ series_id: string; occ_date: string; cancelled: number; done_at: string | null; data: string }>(
    env,
    `SELECT * FROM occurrence_overrides WHERE kind = ? AND series_id IN (${seriesIds.map(() => '?').join(',')})`,
    kind,
    ...seriesIds,
  );
  for (const r of rows) map.set(`${r.series_id}|${r.occ_date}`, { cancelled: r.cancelled, done_at: r.done_at, data: JSON.parse(r.data || '{}') });
  return map;
}

type GoalRow = Record<string, unknown> & { id: string; start_date: string; end_date: string; recurrence: string | null; recur_until: string | null; done_at: string | null };

/** Goals overlapping [from, to] (YYYY-MM-DD), repeating ones expanded, per-occurrence changes applied. */
export async function goalsBetween(env: Env, from: string, to: string, tz: string) {
  const single = await all<GoalRow>(env, 'SELECT * FROM goals WHERE recurrence IS NULL AND start_date <= ? AND end_date >= ?', to, from);
  const series = await all<GoalRow>(
    env,
    'SELECT * FROM goals WHERE recurrence IS NOT NULL AND done_at IS NULL AND start_date <= ? AND (recur_until IS NULL OR recur_until >= ?)',
    to, addDaysIso(from, -400),
  );
  const ov = await loadOverrides(env, 'goal', series.map((g) => g.id));
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${addDaysIso(to, 1)}T00:00:00Z`);
  const expanded = series.flatMap((g) =>
    occurrences({ start_at: g.start_date, end_at: addDaysIso(g.end_date, 1), all_day: 1, recurrence: g.recurrence, recur_until: g.recur_until }, fromMs, toMs, tz)
      .map((o) => {
        const x = ov.get(`${g.id}|${o.occ_date}`);
        if (x?.cancelled) return null;
        return {
          ...g,
          start_date: o.start_at,
          end_date: addDaysIso(o.end_at, -1),
          ...(x?.data ?? {}),
          done_at: x?.done_at ?? null,
          occ_date: o.occ_date,
          series_start_date: g.start_date,
          series_end_date: g.end_date,
          overridden: !!x,
          override: x ?? null,
        };
      })
      .filter(Boolean),
  );
  return [...single, ...expanded];
}

export const occurrencesModule: BackendModule = {
  id: 'occurrences',
  register(r) {
    /** Create or replace the change for one occurrence. Body: kind, series_id, occ_date, cancelled?, done_at?, data? */
    r.put('/api/occurrences', async ({ env, req }) => {
      const b = await readJson(req);
      const kind = b.kind === 'goal' ? 'goal' : b.kind === 'event' ? 'event' : null;
      if (!kind) throw new HttpError(400, 'kind must be event or goal');
      const series = str(b.series_id, 'series_id')!;
      const occ = str(b.occ_date, 'occ_date')!;
      if (!DATE.test(occ)) throw new HttpError(400, 'occ_date must be YYYY-MM-DD');
      const allowed = kind === 'event' ? EVENT_FIELDS : GOAL_FIELDS;
      const data = Object.fromEntries(Object.entries((b.data as Record<string, unknown>) ?? {}).filter(([k]) => allowed.includes(k)));
      if (b.done_at != null && (typeof b.done_at !== 'string' || isNaN(Date.parse(b.done_at)))) throw new HttpError(400, 'done_at must be a date');
      await run(
        env,
        `INSERT INTO occurrence_overrides (kind, series_id, occ_date, cancelled, done_at, data) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind, series_id, occ_date) DO UPDATE SET cancelled = excluded.cancelled, done_at = excluded.done_at, data = excluded.data`,
        kind, series, occ, b.cancelled ? 1 : 0, b.done_at ?? null, JSON.stringify(data),
      );
      return json({ ok: true });
    });

    /** Remove the change for one occurrence (back to the series). */
    r.post('/api/occurrences/reset', async ({ env, req }) => {
      const b = await readJson(req);
      await run(env, 'DELETE FROM occurrence_overrides WHERE kind = ? AND series_id = ? AND occ_date = ?', String(b.kind), String(b.series_id), String(b.occ_date));
      return json({ ok: true });
    });
  },
};

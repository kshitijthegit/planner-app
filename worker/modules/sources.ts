import { all, first, HttpError, json, kvGet, readJson, run, str, uuid } from '../lib/core';
import { listCalendars } from '../lib/google';
import { syncDue, syncSource, type SourceRow } from '../lib/sync';
import type { BackendModule } from './types';

/** Never send the full ICS URL back to the browser: it is effectively a password. */
function publicSource(s: SourceRow) {
  const cfg = JSON.parse(s.config || '{}') as { url?: string; calendarIds?: string[] };
  let urlHint: string | undefined;
  if (cfg.url) {
    try {
      urlHint = `${new URL(cfg.url.replace(/^webcal:/i, 'https:')).host}/…`;
    } catch {
      urlHint = '…';
    }
  }
  return { ...s, config: undefined, calendarIds: cfg.calendarIds, urlHint };
}

function validUrl(v: unknown): string {
  const u = str(v, 'url', { max: 2000 })!;
  if (!/^(https|webcal):\/\//i.test(u)) throw new HttpError(400, 'URL must start with https:// or webcal://');
  return u;
}

export const sourcesModule: BackendModule = {
  id: 'sources',
  register(r) {
    r.get('/api/sources', async ({ env }) => {
      const rows = await all<SourceRow>(env, 'SELECT * FROM sources ORDER BY kind, name');
      const tokens = await kvGet<{ refresh_token?: string }>(env, 'google_tokens');
      // Event counts per source, and per Google calendar (ext_id = "<calendarId>:<eventId>").
      const counts = await all<{ source_id: string; cal: string; n: number }>(
        env,
        `SELECT source_id, substr(ext_id, 1, instr(ext_id, ':') - 1) AS cal, COUNT(*) AS n FROM ext_events GROUP BY source_id, cal`,
      );
      return json({
        googleConnected: !!tokens?.refresh_token,
        sources: rows.map((r) => {
          const mine = counts.filter((c) => c.source_id === r.id);
          return {
            ...publicSource(r),
            eventCount: mine.reduce((a, c) => a + c.n, 0),
            calendarCounts: r.kind === 'google' ? Object.fromEntries(mine.map((c) => [c.cal, c.n])) : undefined,
          };
        }),
      });
    });

    r.post('/api/sources', async ({ env, req }) => {
      const b = await readJson(req);
      if (b.kind !== 'ics') throw new HttpError(400, 'Only ICS sources can be added manually');
      const id = uuid();
      await run(
        env,
        "INSERT INTO sources (id, kind, name, config, category_id, reminder_min) VALUES (?, 'ics', ?, ?, ?, ?)",
        id,
        str(b.name, 'name', { max: 80 }),
        JSON.stringify({ url: validUrl(b.url) }),
        b.category_id ?? null,
        b.reminder_min ?? null,
      );
      const src = (await first<SourceRow>(env, 'SELECT * FROM sources WHERE id = ?', id))!;
      const result = await syncSource(env, src);
      return json({ id, ...result }, 201);
    });

    r.patch('/api/sources/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      const src = await first<SourceRow>(env, 'SELECT * FROM sources WHERE id = ?', params.id);
      if (!src) throw new HttpError(404, 'Source not found');
      const cfg = JSON.parse(src.config || '{}');
      if (src.kind === 'ics' && b.url !== undefined) cfg.url = validUrl(b.url);
      let enabled = b.enabled !== undefined ? (b.enabled ? 1 : 0) : src.enabled;
      if (src.kind === 'google' && Array.isArray(b.calendarIds)) {
        cfg.calendarIds = b.calendarIds.filter((x) => typeof x === 'string');
        enabled = cfg.calendarIds.length ? 1 : 0; // Google source is "on" while any of its calendars is on
      }
      await run(
        env,
        'UPDATE sources SET name = ?, category_id = ?, reminder_min = ?, enabled = ?, config = ? WHERE id = ?',
        typeof b.name === 'string' && b.name ? b.name.slice(0, 80) : src.name,
        b.category_id !== undefined ? b.category_id : src.category_id,
        b.reminder_min !== undefined ? b.reminder_min : src.reminder_min,
        enabled,
        JSON.stringify(cfg),
        src.id,
      );
      if (!enabled) {
        // Sync off: stop syncing and remove its events (they come back on the next sync when switched on).
        await run(env, 'DELETE FROM ext_events WHERE source_id = ?', src.id);
      } else if (b.url !== undefined || b.calendarIds !== undefined || (b.enabled && !src.enabled)) {
        await syncSource(env, (await first<SourceRow>(env, 'SELECT * FROM sources WHERE id = ?', src.id))!);
      }
      return json({ ok: true });
    });

    r.delete('/api/sources/:id', async ({ env, params }) => {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM ext_events WHERE source_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM ext_overrides WHERE source_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM sources WHERE id = ?').bind(params.id),
      ]);
      return json({ ok: true });
    });

    r.post('/api/sources/:id/sync', async ({ env, params }) => {
      const src = await first<SourceRow>(env, 'SELECT * FROM sources WHERE id = ?', params.id);
      if (!src) throw new HttpError(404, 'Source not found');
      return json(await syncSource(env, src));
    });

    r.post('/api/sources/sync-all', async ({ env }) => {
      await syncDue(env, true);
      return json({ ok: true });
    });

    /** Wipe every event: own events, synced copies and category overrides. Linked calendars stay, with sync off. */
    r.post('/api/calendar/wipe', async ({ env }) => {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM events'),
        env.DB.prepare('DELETE FROM ext_events'),
        env.DB.prepare('DELETE FROM ext_overrides'),
        env.DB.prepare("UPDATE sources SET enabled = 0, last_sync = NULL, last_error = NULL"),
        env.DB.prepare(`UPDATE sources SET config = '{"calendarIds":[]}' WHERE kind = 'google'`),
      ]);
      return json({ ok: true });
    });

    r.get('/api/google/calendars', async ({ env }) => json(await listCalendars(env)));
  },
  async cron(env) {
    await syncDue(env);
  },
};

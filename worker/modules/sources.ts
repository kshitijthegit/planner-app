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
      return json({ sources: rows.map(publicSource), googleConnected: !!tokens?.refresh_token });
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
      if (src.kind === 'google' && Array.isArray(b.calendarIds)) cfg.calendarIds = b.calendarIds.filter((x) => typeof x === 'string');
      await run(
        env,
        'UPDATE sources SET name = ?, category_id = ?, reminder_min = ?, enabled = ?, config = ? WHERE id = ?',
        typeof b.name === 'string' && b.name ? b.name.slice(0, 80) : src.name,
        b.category_id !== undefined ? b.category_id : src.category_id,
        b.reminder_min !== undefined ? b.reminder_min : src.reminder_min,
        b.enabled !== undefined ? (b.enabled ? 1 : 0) : src.enabled,
        JSON.stringify(cfg),
        src.id,
      );
      if (b.url !== undefined || b.calendarIds !== undefined) {
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

    r.get('/api/google/calendars', async ({ env }) => json(await listCalendars(env)));
  },
  async cron(env) {
    await syncDue(env);
  },
};

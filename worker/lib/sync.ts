// Read-only calendar sync: Google Calendar + ICS feeds → ext_events table.
import { all, nowIso, run, type Env } from './core';
import { fetchGoogleEvents, type ExtEvent } from './google';
import { parseIcs } from './ics';
import { getSettings } from './settings';

export interface SourceRow {
  id: string;
  kind: 'google' | 'ics';
  name: string;
  config: string;
  category_id: string | null;
  reminder_min: number | null;
  enabled: number;
  last_sync: string | null;
  last_error: string | null;
}

const SYNC_EVERY_MIN = 30;

export async function syncSource(env: Env, src: SourceRow): Promise<{ count: number; error?: string }> {
  const settings = await getSettings(env);
  const from = new Date(Date.now() - 14 * 86400000);
  const to = new Date(Date.now() + 150 * 86400000);
  try {
    const config = JSON.parse(src.config || '{}') as { url?: string; calendarIds?: string[] };
    let events: ExtEvent[] = [];
    if (src.kind === 'google') {
      const ids = config.calendarIds ?? ['primary']; // [] = every calendar switched off
      for (const id of ids) events.push(...(await fetchGoogleEvents(env, id, from, to)));
    } else {
      if (!config.url) throw new Error('No ICS URL set');
      const url = config.url.replace(/^webcal:\/\//i, 'https://');
      const res = await fetch(url, { headers: { accept: 'text/calendar' } });
      if (!res.ok) throw new Error(`ICS fetch failed: HTTP ${res.status}`);
      events = parseIcs(await res.text(), settings.timezone, from, to);
    }
    // Replace this source's events atomically.
    const stmts = [env.DB.prepare('DELETE FROM ext_events WHERE source_id = ?').bind(src.id)];
    const seen = new Set<string>();
    const rows = events.filter((e) => !seen.has(e.ext_id) && seen.add(e.ext_id));
    for (let i = 0; i < rows.length; i += 10) {
      const chunk = rows.slice(i, i + 10);
      const sql = `INSERT INTO ext_events (source_id, ext_id, series_id, title, start_at, end_at, all_day, location) VALUES ${chunk
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ')}`;
      stmts.push(
        env.DB.prepare(sql).bind(
          ...chunk.flatMap((e) => [src.id, e.ext_id, e.series_id, e.title, e.start_at, e.end_at, e.all_day, e.location]),
        ),
      );
    }
    stmts.push(env.DB.prepare('UPDATE sources SET last_sync = ?, last_error = NULL WHERE id = ?').bind(nowIso(), src.id));
    await env.DB.batch(stmts);
    return { count: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await run(env, 'UPDATE sources SET last_sync = ?, last_error = ? WHERE id = ?', nowIso(), msg.slice(0, 300), src.id);
    return { count: 0, error: msg };
  }
}

export async function syncDue(env: Env, force = false): Promise<void> {
  const sources = await all<SourceRow>(env, 'SELECT * FROM sources WHERE enabled = 1');
  const cutoff = Date.now() - SYNC_EVERY_MIN * 60000;
  for (const s of sources) {
    if (force || !s.last_sync || Date.parse(s.last_sync) < cutoff) await syncSource(env, s);
  }
}

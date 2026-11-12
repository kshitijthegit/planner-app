// Capture: add events/tasks from outside the app (the Gmail add-on in /gmail-addon).
// The add-on signs in with a personal access key (generated in Settings, stored hashed),
// and can only read areas/categories and create new items — nothing else.
import { all, first, HttpError, json, kvGet, kvSet, nowIso, readJson, run, str, uuid, type Env } from '../lib/core';
import { getSettings } from '../lib/settings';
import { addDaysIso, zonedToUtc } from '../lib/time';
import { hasValidSession } from './auth';
import type { BackendModule } from './types';

const KEY = 'capture_key';
interface StoredKey { hash: string; created_at: string }

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (both are hex hashes of equal length). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function requireKey(env: Env, req: Request): Promise<void> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (m) {
    const stored = await kvGet<StoredKey>(env, KEY);
    if (stored && same(await sha256(m[1]), stored.hash)) return;
    throw new HttpError(401, 'Access key not valid — generate a new one in Settings → Gmail add-on');
  }
  if (await hasValidSession(env, req)) return;
  throw new HttpError(401, 'Missing access key');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const captureModule: BackendModule = {
  id: 'capture',
  register(r) {
    // ----- Key management (signed-in app only) -----
    r.get('/api/capture/key', async ({ env }) => {
      const k = await kvGet<StoredKey>(env, KEY);
      return json({ exists: !!k, created_at: k?.created_at ?? null });
    });
    r.post('/api/capture/key', async ({ env }) => {
      const raw = 'pk_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      await kvSet(env, KEY, { hash: await sha256(raw), created_at: nowIso() } satisfies StoredKey);
      return json({ key: raw }, 201);
    });
    r.delete('/api/capture/key', async ({ env }) => {
      await run(env, 'DELETE FROM kv WHERE key = ?', KEY);
      return json({ ok: true });
    });

    // ----- Used by the add-on (access key) -----
    r.get(
      '/api/capture/meta',
      async ({ env, req }) => {
        await requireKey(env, req);
        const s = await getSettings(env);
        return json({
          areas: await all(env, 'SELECT id, name FROM areas ORDER BY sort, name'),
          categories: await all(env, 'SELECT id, name, area_id FROM categories ORDER BY sort, name'),
          timezone: s.timezone,
        });
      },
      { isPublic: true },
    );

    r.post(
      '/api/capture',
      async ({ env, req }) => {
        await requireKey(env, req);
        const b = await readJson(req);
        const kind = b.kind === 'task' ? 'task' : b.kind === 'event' ? 'event' : null;
        if (!kind) throw new HttpError(400, 'kind must be event or task');
        const title = str(b.title, 'title', { max: 300 })!;
        let areaId = str(b.area_id, 'area_id', { optional: true, max: 80 });
        if (areaId && !(await first(env, 'SELECT id FROM areas WHERE id = ?', areaId))) throw new HttpError(400, 'Unknown area');
        const catId = str(b.category_id, 'category_id', { optional: true, max: 80 }) || null;
        if (catId) {
          const cat = await first<{ area_id: string }>(env, 'SELECT area_id FROM categories WHERE id = ?', catId);
          if (!cat) throw new HttpError(400, 'Unknown sub-category');
          areaId = cat.area_id; // a chosen sub-category decides the area
        }
        const date = typeof b.date === 'string' && DATE.test(b.date) ? b.date : null;
        const time = typeof b.time === 'string' && TIME.test(b.time) ? b.time : null;
        const endTime = typeof b.end_time === 'string' && TIME.test(b.end_time) ? b.end_time : null;
        const link = typeof b.link === 'string' && /^https:\/\/mail\.google\.com\//.test(b.link) ? b.link : null;
        const notes = [str(b.notes, 'notes', { optional: true, max: 20000 }) ?? '', link ? `From Gmail: ${link}` : '']
          .filter(Boolean)
          .join('\n\n');
        const now = nowIso();
        const id = uuid();

        if (kind === 'task') {
          await run(
            env,
            `INSERT INTO tasks (id, title, notes, category_id, area_id, priority, due_date, due_time, sort, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
            id, title, notes, catId, areaId, date, date ? time : null, now, now,
          );
          return json({ ok: true, kind, id }, 201);
        }

        if (!date) throw new HttpError(400, 'An event needs a date');
        const tz = (await getSettings(env)).timezone;
        let start: string, end: string, allDay: number;
        if (b.all_day || !time) {
          start = date;
          end = addDaysIso(date, 1);
          allDay = 1;
        } else {
          const s = zonedToUtc(date, time, tz);
          let e = endTime ? zonedToUtc(date, endTime, tz) : new Date(s.getTime() + 60 * 60000);
          if (e <= s) e = new Date(e.getTime() + 86400000); // ends after midnight
          start = s.toISOString();
          end = e.toISOString();
          allDay = 0;
        }
        const location = str(b.location, 'location', { optional: true, max: 300 }) ?? '';
        await run(
          env,
          `INSERT INTO events (id, title, notes, category_id, area_id, priority, start_at, end_at, all_day, location, attendance, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'yes', ?, ?)`,
          id, title, notes, catId, areaId, start, end, allDay, location, now, now,
        );
        return json({ ok: true, kind, id }, 201);
      },
      { isPublic: true },
    );
  },
};

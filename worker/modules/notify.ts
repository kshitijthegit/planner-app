// Reminders, morning digest and evening shutdown pushes (all driven by the 5-minute cron).
import { all, json, nowIso, run, type Env } from '../lib/core';
import { sendPush } from '../lib/push';
import { getSettings, moduleEnabled, type Settings } from '../lib/settings';
import { addDaysIso, hhmmToMinutes, localParts, zonedToUtc } from '../lib/time';
import type { BackendModule } from './types';
import type { TaskRow } from './tasks';

/** Atomically claim a notification key so each reminder fires exactly once. */
async function claim(env: Env, key: string): Promise<boolean> {
  const res = await env.DB.prepare('INSERT OR IGNORE INTO sent_log (key, sent_at) VALUES (?, ?)').bind(key, nowIso()).run();
  return (res.meta?.changes ?? 0) > 0;
}

function hm(iso: string, tz: string): string {
  return localParts(new Date(iso), tz).time;
}

interface CalItem {
  title: string;
  start_at: string;
  end_at: string;
  all_day: number;
}

export async function dayAgenda(env: Env, date: string, tz: string): Promise<{ timed: CalItem[]; allDay: CalItem[] }> {
  const start = zonedToUtc(date, '00:00', tz).toISOString();
  const end = zonedToUtc(addDaysIso(date, 1), '00:00', tz).toISOString();
  const q = (table: string, extraJoin = '') =>
    all<CalItem>(
      env,
      `SELECT e.title, e.start_at, e.end_at, e.all_day FROM ${table} e ${extraJoin}
       WHERE (e.all_day = 0 AND e.start_at < ? AND e.end_at > ?) OR (e.all_day = 1 AND e.start_at <= ? AND e.end_at > ?)`,
      end, start, date, date,
    );
  const rows = [...(await q('events')), ...(await q('ext_events', 'JOIN sources s ON s.id = e.source_id AND s.enabled = 1'))];
  return {
    timed: rows.filter((r) => !r.all_day).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    allDay: rows.filter((r) => r.all_day),
  };
}

export async function buildDigest(env: Env, settings: Settings, now = new Date()) {
  const tz = settings.timezone;
  const today = localParts(now, tz).date;
  const { timed, allDay } = await dayAgenda(env, today, tz);
  const open = await all<TaskRow>(env, 'SELECT * FROM tasks WHERE done_at IS NULL AND parent_id IS NULL ORDER BY priority DESC, due_date');
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today);
  let top = open.filter((t) => t.top3_date === today);
  if (!top.length) top = [...overdue, ...dueToday].sort((a, b) => b.priority - a.priority).slice(0, 3);

  const lines: string[] = [];
  const evCount = timed.length + allDay.length;
  if (evCount) {
    const first = timed[0];
    lines.push(`${evCount} event${evCount > 1 ? 's' : ''}${first ? ` · first ${hm(first.start_at, tz)} ${first.title}` : ''}`);
  } else lines.push('No events today');
  if (top.length) lines.push(`Top: ${top.slice(0, 3).map((t) => t.title).join(', ')}`);
  const counts = [dueToday.length && `${dueToday.length} due today`, overdue.length && `${overdue.length} overdue`].filter(Boolean);
  if (counts.length) lines.push(counts.join(' · '));
  return { title: `Good morning, ${settings.displayName}`, body: lines.join('\n'), url: '/', tag: `digest-${today}` };
}

async function reminders(env: Env, settings: Settings, now: Date) {
  const tz = settings.timezone;
  const nowMs = now.getTime();
  const lo = new Date(nowMs - 60 * 60000).toISOString();
  const hi = new Date(nowMs + 25 * 3600000).toISOString();
  const due = (targetIso: string, remMin: number) => {
    const target = Date.parse(targetIso);
    const fireAt = target - remMin * 60000;
    return nowMs >= fireAt && nowMs - fireAt < 60 * 60000 && nowMs < target + 30 * 60000;
  };

  // Tasks: due date+time, and time-blocks.
  const today = localParts(now, tz).date;
  const tasks = await all<TaskRow>(
    env,
    `SELECT * FROM tasks WHERE done_at IS NULL AND reminder_min IS NOT NULL
     AND ((due_date BETWEEN ? AND ? AND due_time IS NOT NULL) OR (scheduled_start BETWEEN ? AND ?))`,
    addDaysIso(today, -1), addDaysIso(today, 1), lo, hi,
  );
  for (const t of tasks) {
    if (t.due_date && t.due_time) {
      const target = zonedToUtc(t.due_date, t.due_time, tz).toISOString();
      if (due(target, t.reminder_min!) && (await claim(env, `task:${t.id}:${target}`)))
        await sendPush(env, { title: t.title, body: `Due ${t.due_time}`, url: '/tasks', tag: `task-${t.id}` });
    }
    if (t.scheduled_start && due(t.scheduled_start, t.reminder_min!) && (await claim(env, `block:${t.id}:${t.scheduled_start}`)))
      await sendPush(env, { title: t.title, body: `Time block at ${hm(t.scheduled_start, tz)}`, url: '/', tag: `block-${t.id}` });
  }

  // Own events.
  const evs = await all<{ id: string; title: string; start_at: string; location: string; reminder_min: number }>(
    env,
    'SELECT * FROM events WHERE all_day = 0 AND reminder_min IS NOT NULL AND start_at BETWEEN ? AND ?',
    lo, hi,
  );
  for (const e of evs)
    if (due(e.start_at, e.reminder_min) && (await claim(env, `event:${e.id}:${e.start_at}`)))
      await sendPush(env, { title: e.title, body: `Starts ${hm(e.start_at, tz)}${e.location ? ` · ${e.location}` : ''}`, url: '/calendar', tag: `event-${e.id}` });

  // Synced events use their source's default reminder.
  const ext = await all<{ source_id: string; ext_id: string; title: string; start_at: string; location: string; reminder_min: number }>(
    env,
    `SELECT e.source_id, e.ext_id, e.title, e.start_at, e.location, s.reminder_min FROM ext_events e
     JOIN sources s ON s.id = e.source_id AND s.enabled = 1 AND s.reminder_min IS NOT NULL
     WHERE e.all_day = 0 AND e.start_at BETWEEN ? AND ?`,
    lo, hi,
  );
  for (const e of ext)
    if (due(e.start_at, e.reminder_min) && (await claim(env, `ext:${e.source_id}:${e.ext_id}:${e.start_at}`)))
      await sendPush(env, { title: e.title, body: `Starts ${hm(e.start_at, tz)}${e.location ? ` · ${e.location}` : ''}`, url: '/calendar', tag: `ext-${e.ext_id}` });
}

/** True when local time is within [target, target+window) minutes. */
function inWindow(nowMin: number, target: string, windowMin = 120): boolean {
  const t = hhmmToMinutes(target);
  return nowMin >= t && nowMin < t + windowMin;
}

export const notifyModule: BackendModule = {
  id: 'notify',
  register(r) {
    r.get('/api/digest/preview', async ({ env }) => json(await buildDigest(env, await getSettings(env))));
    r.post('/api/digest/send-now', async ({ env }) => {
      const d = await buildDigest(env, await getSettings(env));
      return json({ ...d, delivered: await sendPush(env, d) });
    });
  },
  async cron(env, now) {
    const settings = await getSettings(env);
    const local = localParts(now, settings.timezone);

    await reminders(env, settings, now);

    if (settings.digestEnabled && inWindow(local.minutes, settings.digestTime) && (await claim(env, `digest:${local.date}`)))
      await sendPush(env, await buildDigest(env, settings, now));

    if (
      settings.shutdownEnabled &&
      moduleEnabled(settings, 'shutdown') &&
      inWindow(local.minutes, settings.shutdownTime) &&
      (await claim(env, `shutdown:${local.date}`))
    ) {
      const left = await all(
        env,
        'SELECT id FROM tasks WHERE done_at IS NULL AND parent_id IS NULL AND (due_date <= ? OR top3_date = ?)',
        local.date, local.date,
      );
      await sendPush(env, {
        title: 'Evening shutdown',
        body: left.length ? `${left.length} task${left.length > 1 ? 's' : ''} still open — review and plan tomorrow.` : 'All clear today. Plan tomorrow’s top 3.',
        url: '/?shutdown=1',
        tag: `shutdown-${local.date}`,
      });
    }

    await run(env, 'DELETE FROM sent_log WHERE sent_at < ?', new Date(now.getTime() - 14 * 86400000).toISOString());
  },
};

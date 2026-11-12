// Database schema. Migrations run automatically on the first request/cron of each isolate,
// so no manual `wrangler d1 migrations apply` step is needed. Append new migrations; never edit old ones.
import type { Env } from './core';

const MIGRATIONS: string[][] = [
  // v1 — initial schema
  [
    `CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE sessions (token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE areas (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE categories (
      id TEXT PRIMARY KEY, area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      category_id TEXT, priority INTEGER NOT NULL DEFAULT 0,
      due_date TEXT, due_time TEXT, duration_min INTEGER, scheduled_start TEXT,
      recurrence TEXT, parent_id TEXT, top3_date TEXT, reminder_min INTEGER,
      done_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX idx_tasks_open ON tasks (done_at, due_date)`,
    `CREATE TABLE events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', category_id TEXT,
      start_at TEXT NOT NULL, end_at TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '', reminder_min INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX idx_events_start ON events (start_at)`,
    `CREATE TABLE sources (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}',
      category_id TEXT, reminder_min INTEGER, enabled INTEGER NOT NULL DEFAULT 1,
      last_sync TEXT, last_error TEXT)`,
    `CREATE TABLE ext_events (
      source_id TEXT NOT NULL, ext_id TEXT NOT NULL, series_id TEXT NOT NULL,
      title TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '', PRIMARY KEY (source_id, ext_id))`,
    `CREATE INDEX idx_ext_start ON ext_events (start_at)`,
    `CREATE TABLE ext_overrides (source_id TEXT NOT NULL, series_id TEXT NOT NULL, category_id TEXT, PRIMARY KEY (source_id, series_id))`,
    `CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE sent_log (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)`,
    // Seed areas & categories (editable in the app)
    `INSERT INTO areas (id, name, color, sort) VALUES
      ('area-uni', 'Uni', '#5B9BF5', 0), ('area-work', 'Work', '#E3C567', 1), ('area-personal', 'Personal', '#F29B5B', 2)`,
    `INSERT INTO categories (id, area_id, name, color, sort) VALUES
      ('cat-classes', 'area-uni', 'Classes', '#5B9BF5', 0),
      ('cat-assignments', 'area-uni', 'Assignments', '#B48CF2', 1),
      ('cat-work', 'area-work', 'General', '#E3C567', 0),
      ('cat-social', 'area-personal', 'Social', '#F29B5B', 0),
      ('cat-chores', 'area-personal', 'Chores', '#6CCB8F', 1)`,
  ],
  // v2 — one-off wipe of all calendar data (requested 2026-11-11); linked calendars stay listed with sync off.
  //      Also recolour seeded categories for the Phthalo & Coffee theme (only if still at their old defaults).
  [
    `DELETE FROM events`,
    `DELETE FROM ext_events`,
    `DELETE FROM ext_overrides`,
    `UPDATE sources SET enabled = 0, last_sync = NULL, last_error = NULL`,
    `UPDATE sources SET config = '{"calendarIds":[]}' WHERE kind = 'google'`,
    `UPDATE categories SET color = '#8EC5E8' WHERE id = 'cat-classes' AND color = '#5B9BF5'`,
    `UPDATE categories SET color = '#C7A6E8' WHERE id = 'cat-assignments' AND color = '#B48CF2'`,
    `UPDATE categories SET color = '#E8C46A' WHERE id = 'cat-work' AND color = '#E3C567'`,
    `UPDATE categories SET color = '#E8956A' WHERE id = 'cat-social' AND color = '#F29B5B'`,
    `UPDATE categories SET color = '#9ED39A' WHERE id = 'cat-chores' AND color = '#6CCB8F'`,
    `UPDATE areas SET color = '#8EC5E8' WHERE id = 'area-uni' AND color = '#5B9BF5'`,
    `UPDATE areas SET color = '#E8C46A' WHERE id = 'area-work' AND color = '#E3C567'`,
    `UPDATE areas SET color = '#E8956A' WHERE id = 'area-personal' AND color = '#F29B5B'`,
  ],
  // v3 — goals, area on tasks/events, event priority; area names/colours per KJ (Personal espresso, University mocha, Work latte).
  [
    `ALTER TABLE tasks ADD COLUMN area_id TEXT`,
    `ALTER TABLE events ADD COLUMN area_id TEXT`,
    `ALTER TABLE events ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`,
    `UPDATE tasks SET area_id = (SELECT area_id FROM categories c WHERE c.id = tasks.category_id) WHERE category_id IS NOT NULL`,
    `UPDATE events SET area_id = (SELECT area_id FROM categories c WHERE c.id = events.category_id) WHERE category_id IS NOT NULL`,
    `CREATE TABLE goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', area_id TEXT, category_id TEXT,
      priority INTEGER NOT NULL DEFAULT 0, start_date TEXT NOT NULL, end_date TEXT NOT NULL, done_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX idx_goals_dates ON goals (start_date, end_date)`,
    `UPDATE areas SET name = 'University' WHERE id = 'area-uni' AND name = 'Uni'`,
    `UPDATE areas SET color = '#3B2618' WHERE id = 'area-personal'`,
    `UPDATE areas SET color = '#6F4E37' WHERE id = 'area-uni'`,
    `UPDATE areas SET color = '#C89F72' WHERE id = 'area-work'`,
    `UPDATE areas SET sort = 0 WHERE id = 'area-personal'`,
    `UPDATE areas SET sort = 1 WHERE id = 'area-uni'`,
    `UPDATE areas SET sort = 2 WHERE id = 'area-work'`,
  ],
  // v4 — planned attendance (yes/no/maybe) and recurring events.
  [
    `ALTER TABLE events ADD COLUMN attendance TEXT NOT NULL DEFAULT 'yes'`,
    `ALTER TABLE events ADD COLUMN recurrence TEXT`,
    `ALTER TABLE events ADD COLUMN recur_until TEXT`,
    `CREATE TABLE ext_attendance (source_id TEXT NOT NULL, ext_id TEXT NOT NULL, attendance TEXT NOT NULL, PRIMARY KEY (source_id, ext_id))`,
  ],
  // v5 — linked events for tasks, repeating goals, per-occurrence changes, Google event-type filter, uploaded calendar files.
  [
    `ALTER TABLE events ADD COLUMN task_id TEXT`,
    `ALTER TABLE goals ADD COLUMN recurrence TEXT`,
    `ALTER TABLE goals ADD COLUMN recur_until TEXT`,
    `CREATE TABLE occurrence_overrides (
      kind TEXT NOT NULL, series_id TEXT NOT NULL, occ_date TEXT NOT NULL,
      cancelled INTEGER NOT NULL DEFAULT 0, done_at TEXT, data TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (kind, series_id, occ_date))`,
    `CREATE TABLE source_files (source_id TEXT PRIMARY KEY, content TEXT NOT NULL)`,
    `UPDATE sources SET config = json_set(config, '$.eventTypes', json('["default","birthday"]')) WHERE kind = 'google'`,
  ],
  // v6 — keep Google's event type (e.g. birthday) on synced events so the calendar can colour them.
  [`ALTER TABLE ext_events ADD COLUMN event_type TEXT`],
];

let migratedInIsolate = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (migratedInIsolate) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)').run();
  const row = await env.DB.prepare('SELECT MAX(version) AS v FROM _migrations').first<{ v: number | null }>();
  const current = row?.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    const stmts = MIGRATIONS[i].map((sql) => env.DB.prepare(sql));
    stmts.push(env.DB.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').bind(version, new Date().toISOString()));
    await env.DB.batch(stmts); // batch = one transaction
  }
  migratedInIsolate = true;
}

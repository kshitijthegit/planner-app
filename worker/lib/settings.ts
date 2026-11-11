import { kvGet, kvSet, type Env } from './core';

export interface Settings {
  displayName: string;
  timezone: string;
  digestTime: string; // HH:MM local
  digestEnabled: boolean;
  shutdownTime: string; // HH:MM local
  shutdownEnabled: boolean;
  defaultReminderMin: number | null;
  /** Feature-module toggles. Missing key = enabled. */
  modules: Record<string, boolean>;
  /** Priority level names, index = stored value. Users can add levels (max 10). */
  priorityLabels: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'KJ',
  timezone: 'Asia/Singapore',
  digestTime: '08:00',
  digestEnabled: true,
  shutdownTime: '21:30',
  shutdownEnabled: true,
  defaultReminderMin: 15,
  modules: {},
  priorityLabels: ['None', 'Low', 'Medium', 'High'],
};

export async function getSettings(env: Env): Promise<Settings> {
  const stored = (await kvGet<Partial<Settings>>(env, 'settings')) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored, modules: { ...DEFAULT_SETTINGS.modules, ...(stored.modules ?? {}) } };
}

export async function saveSettings(env: Env, patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings(env);
  const next: Settings = { ...current };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof patch.timezone === 'string') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: patch.timezone });
      next.timezone = patch.timezone;
    } catch {
      /* ignore invalid tz */
    }
  }
  if (typeof patch.displayName === 'string') next.displayName = patch.displayName.slice(0, 40);
  if (typeof patch.digestTime === 'string' && time.test(patch.digestTime)) next.digestTime = patch.digestTime;
  if (typeof patch.shutdownTime === 'string' && time.test(patch.shutdownTime)) next.shutdownTime = patch.shutdownTime;
  if (typeof patch.digestEnabled === 'boolean') next.digestEnabled = patch.digestEnabled;
  if (typeof patch.shutdownEnabled === 'boolean') next.shutdownEnabled = patch.shutdownEnabled;
  if (patch.defaultReminderMin === null || typeof patch.defaultReminderMin === 'number')
    next.defaultReminderMin = patch.defaultReminderMin;
  if (Array.isArray(patch.priorityLabels)) {
    const labels = patch.priorityLabels.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 24)).slice(0, 10);
    if (labels.length >= 1) next.priorityLabels = labels;
  }
  if (patch.modules && typeof patch.modules === 'object') {
    next.modules = { ...current.modules };
    for (const [k, v] of Object.entries(patch.modules)) if (typeof v === 'boolean') next.modules[k] = v;
  }
  await kvSet(env, 'settings', next);
  return next;
}

export function moduleEnabled(s: Settings, id: string): boolean {
  return s.modules[id] !== false;
}

// Typed API client + shared data types.

export interface Area { id: string; name: string; color: string; sort: number }
export interface Category { id: string; area_id: string; name: string; color: string; sort: number }

export interface Task {
  id: string;
  title: string;
  notes: string;
  category_id: string | null;
  area_id: string | null;
  priority: number; // index into settings.priorityLabels
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM
  duration_min: number | null;
  scheduled_start: string | null; // ISO — time-block on the calendar
  recurrence: string | null; // daily | weekdays | weekly | monthly | every:N:day|week|month
  parent_id: string | null;
  top3_date: string | null;
  reminder_min: number | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  sort: number;
}

export interface CalEvent {
  kind: 'own' | 'ext';
  id?: string; // own
  source_id?: string; // ext
  ext_id?: string;
  series_id?: string;
  source_name?: string;
  source_kind?: 'google' | 'ics';
  title: string;
  notes?: string;
  start_at: string; // ISO, or YYYY-MM-DD when all_day
  end_at: string;
  all_day: number;
  location: string;
  category_id: string | null;
  area_id?: string | null;
  priority?: number;
  reminder_min?: number | null;
}

export interface Goal {
  id: string;
  title: string;
  notes: string;
  area_id: string | null;
  category_id: string | null;
  priority: number;
  start_date: string; // YYYY-MM-DD
  end_date: string; // inclusive
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  kind: 'google' | 'ics';
  name: string;
  category_id: string | null;
  reminder_min: number | null;
  enabled: number;
  last_sync: string | null;
  last_error: string | null;
  calendarIds?: string[];
  urlHint?: string;
  eventCount?: number;
  calendarCounts?: Record<string, number>;
}

export interface Settings {
  displayName: string;
  timezone: string;
  digestTime: string;
  digestEnabled: boolean;
  shutdownTime: string;
  shutdownEnabled: boolean;
  defaultReminderMin: number | null;
  modules: Record<string, boolean>;
  priorityLabels: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (res.status === 401) window.dispatchEvent(new Event('planner:unauth'));
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};

// Google OAuth + Calendar (read-only).
import { HttpError, kvGet, kvSet, type Env } from './core';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'];

interface GoogleTokens {
  refresh_token?: string;
  access_token?: string;
  expires_at?: number; // epoch ms
}

/** Lower-case, strip quotes/spaces; for Gmail ignore dots and +tags (Google treats them as the same inbox). */
export function normalizeEmail(raw: string): string {
  const e = raw.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  const [local, domain] = e.split('@');
  if (!domain) return e;
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return e;
}

export function redirectUri(env: Env): string {
  return `${env.APP_URL}/api/auth/google/callback`;
}

export function authUrl(env: Env, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(env: Env, body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: (env.GOOGLE_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, ''), ...body }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new HttpError(502, `Google token error: ${data.error_description || data.error || res.status}`);
  return data as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

/** Exchange the auth code; store tokens; return the verified email from the id_token. */
export async function exchangeCode(env: Env, code: string): Promise<string> {
  const data = await tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(env) });
  if (!data.id_token) throw new HttpError(502, 'No id_token from Google');
  // id_token came straight from Google's token endpoint over TLS, so decoding without signature check is acceptable (OIDC §3.1.3.7).
  const payload = JSON.parse(atob(data.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!payload.email || !payload.email_verified) throw new HttpError(403, 'Google account email not verified');
  const allowed = normalizeEmail(env.ALLOWED_EMAIL || '');
  if (!allowed) throw new HttpError(403, 'ALLOWED_EMAIL secret is not set in Cloudflare');
  if (normalizeEmail(payload.email) !== allowed)
    throw new HttpError(403, `Signed in as ${payload.email}, which doesn't match ALLOWED_EMAIL`);
  const prev = (await kvGet<GoogleTokens>(env, 'google_tokens')) ?? {};
  await kvSet(env, 'google_tokens', {
    refresh_token: data.refresh_token ?? prev.refresh_token,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return payload.email;
}

export async function accessToken(env: Env): Promise<string> {
  const t = await kvGet<GoogleTokens>(env, 'google_tokens');
  if (!t?.refresh_token) throw new HttpError(409, 'Google not connected');
  if (t.access_token && t.expires_at && t.expires_at > Date.now()) return t.access_token;
  const data = await tokenRequest(env, { refresh_token: t.refresh_token, grant_type: 'refresh_token' });
  await kvSet(env, 'google_tokens', { ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}

async function gget<T>(env: Env, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${await accessToken(env)}` } });
  if (!res.ok) throw new HttpError(502, `Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function listCalendars(env: Env) {
  const data = await gget<{ items: { id: string; summary: string; primary?: boolean; backgroundColor?: string }[] }>(
    env,
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
  );
  return data.items.map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary }));
}

export interface ExtEvent {
  ext_id: string;
  series_id: string;
  title: string;
  start_at: string; // ISO UTC, or YYYY-MM-DD if all_day
  end_at: string;
  all_day: number;
  location: string;
}

interface GEvent {
  id: string;
  eventType?: string;
  status?: string;
  summary?: string;
  location?: string;
  recurringEventId?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

/** Google event types that can be synced (Calendar API `eventType`). */
export const GOOGLE_EVENT_TYPES = ['default', 'birthday', 'fromGmail', 'outOfOffice', 'focusTime', 'workingLocation'] as const;

export async function fetchGoogleEvents(env: Env, calendarId: string, from: Date, to: Date, eventTypes?: string[]): Promise<ExtEvent[]> {
  const out: ExtEvent[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: '2500',
    });
    if (pageToken) p.set('pageToken', pageToken);
    for (const t of eventTypes ?? []) p.append('eventTypes', t);
    const data = await gget<{ items: GEvent[]; nextPageToken?: string }>(
      env,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${p}`,
    );
    for (const e of data.items) {
      if (e.status === 'cancelled') continue;
      if (eventTypes && !eventTypes.includes(e.eventType ?? 'default')) continue; // belt and braces
      const allDay = !!e.start.date;
      out.push({
        ext_id: `${calendarId}:${e.id}`,
        series_id: `${calendarId}:${e.recurringEventId ?? e.id}`,
        title: e.summary || '(no title)',
        start_at: allDay ? e.start.date! : new Date(e.start.dateTime!).toISOString(),
        end_at: allDay ? e.end.date! : new Date(e.end.dateTime!).toISOString(),
        all_day: allDay ? 1 : 0,
        location: e.location ?? '',
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

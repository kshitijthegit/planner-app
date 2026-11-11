import { first, getCookie, HttpError, json, run, uuid, type Env } from '../lib/core';
import { authUrl, exchangeCode } from '../lib/google';
import type { BackendModule } from './types';

const SESSION_DAYS = 90;

function cookie(name: string, value: string, maxAge: number, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function hasValidSession(env: Env, req: Request): Promise<boolean> {
  const sid = getCookie(req, 'sid');
  if (!sid) return false;
  const row = await first<{ expires_at: number }>(env, 'SELECT expires_at FROM sessions WHERE token = ?', sid);
  return !!row && row.expires_at > Date.now();
}

function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export const authModule: BackendModule = {
  id: 'auth',
  register(r) {
    r.get(
      '/api/auth/login',
      ({ env }) => {
        const state = uuid();
        return redirect(authUrl(env, state), [cookie('oauth_state', state, 600, '/api/auth')]);
      },
      { isPublic: true },
    );

    r.get(
      '/api/auth/google/callback',
      async ({ env, req, url }) => {
        const clearState = cookie('oauth_state', '', 0, '/api/auth');
        const fail = (msg: string) => redirect(`/?auth_error=${encodeURIComponent(msg)}`, [clearState]);
        if (url.searchParams.get('error')) return fail(url.searchParams.get('error')!);
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (!state || !code || state !== getCookie(req, 'oauth_state')) return fail('Login expired, try again');
        try {
          await exchangeCode(env, code);
        } catch (e) {
          return fail(e instanceof HttpError ? e.message : 'Google sign-in failed');
        }
        // Make sure the Google calendar source exists.
        const g = await first(env, "SELECT id FROM sources WHERE kind = 'google'");
        if (!g) {
          await run(
            env,
            "INSERT INTO sources (id, kind, name, config, category_id) VALUES (?, 'google', 'Google Calendar', ?, 'cat-social')",
            uuid(),
            JSON.stringify({ calendarIds: ['primary'] }),
          );
        }
        const token = randomToken();
        await run(env, 'INSERT INTO sessions (token, expires_at) VALUES (?, ?)', token, Date.now() + SESSION_DAYS * 86400000);
        return redirect('/', [clearState, cookie('sid', token, SESSION_DAYS * 86400)]);
      },
      { isPublic: true },
    );

    r.get(
      '/api/auth/me',
      async ({ env, req }) => json({ authenticated: await hasValidSession(env, req) }),
      { isPublic: true },
    );

    r.post('/api/auth/logout', async ({ env, req }) => {
      const sid = getCookie(req, 'sid');
      if (sid) await run(env, 'DELETE FROM sessions WHERE token = ?', sid);
      return json({ ok: true }, 200, { 'set-cookie': cookie('sid', '', 0) });
    });
  },
  async cron(env) {
    await run(env, 'DELETE FROM sessions WHERE expires_at < ?', Date.now());
  },
};

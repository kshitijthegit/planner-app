// Core helpers shared by every backend module: env typing, HTTP helpers, router, DB access.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_EMAIL: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// ---------- Router ----------

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  exec: ExecutionContext;
}

type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
  isPublic: boolean;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: Handler, opts: { isPublic?: boolean } = {}) {
    const keys: string[] = [];
    const pattern = path.replace(/:([a-zA-Z_]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${pattern}$`), keys, handler, isPublic: !!opts.isPublic });
  }
  get(p: string, h: Handler, o?: { isPublic?: boolean }) { this.add('GET', p, h, o); }
  post(p: string, h: Handler, o?: { isPublic?: boolean }) { this.add('POST', p, h, o); }
  put(p: string, h: Handler, o?: { isPublic?: boolean }) { this.add('PUT', p, h, o); }
  patch(p: string, h: Handler, o?: { isPublic?: boolean }) { this.add('PATCH', p, h, o); }
  delete(p: string, h: Handler, o?: { isPublic?: boolean }) { this.add('DELETE', p, h, o); }

  match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
    if (pathMatched) throw new HttpError(405, 'Method not allowed');
    return null;
  }
}

// ---------- Database ----------

export async function all<T = Record<string, unknown>>(env: Env, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await env.DB.prepare(sql).bind(...binds).all<T>();
  return res.results ?? [];
}

export async function first<T = Record<string, unknown>>(env: Env, sql: string, ...binds: unknown[]): Promise<T | null> {
  return (await env.DB.prepare(sql).bind(...binds).first<T>()) ?? null;
}

export async function run(env: Env, sql: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(sql).bind(...binds).run();
}

export async function kvGet<T>(env: Env, key: string): Promise<T | null> {
  const row = await first<{ value: string }>(env, 'SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(env: Env, key: string, value: unknown): Promise<void> {
  await run(
    env,
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

/** Build "UPDATE table SET a=?, b=? WHERE id=?" from an allow-listed patch object. */
export async function patchRow(
  env: Env,
  table: string,
  id: string,
  body: Record<string, unknown>,
  allowed: string[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  const fields = { ...Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k))), ...extra };
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await run(env, sql, ...keys.map((k) => normalize(fields[k])), id);
}

function normalize(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export function str(v: unknown, field: string, opts: { max?: number; optional?: boolean } = {}): string | null {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return null;
    throw new HttpError(400, `${field} is required`);
  }
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be a string`);
  if (opts.max && v.length > opts.max) throw new HttpError(400, `${field} is too long`);
  return v;
}

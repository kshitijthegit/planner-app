import { HttpError, json, Router, type Env } from './lib/core';
import { ensureSchema } from './lib/schema';
import { hasValidSession } from './modules/auth';
import { modules } from './modules';

const router = new Router();
for (const m of modules) m.register(router);

export default {
  async fetch(req: Request, env: Env, exec: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await ensureSchema(env);
      const found = router.match(req.method, url.pathname);
      if (!found) throw new HttpError(404, 'Not found');
      if (!found.route.isPublic && !(await hasValidSession(env, req))) throw new HttpError(401, 'Not signed in');
      return await found.route.handler({ req, env, url, params: found.params, exec });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Server error' }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, exec: ExecutionContext): Promise<void> {
    await ensureSchema(env);
    const now = new Date();
    for (const m of modules) {
      if (!m.cron) continue;
      try {
        await m.cron(env, now);
      } catch (e) {
        console.error(`cron ${m.id} failed`, e);
      }
    }
  },
} satisfies ExportedHandler<Env>;

import { HttpError, json, nowIso, readJson, run, str } from '../lib/core';
import { getVapid, sendPush } from '../lib/push';
import type { BackendModule } from './types';

export const pushModule: BackendModule = {
  id: 'push',
  register(r) {
    r.get('/api/push/key', async ({ env }) => json({ publicKey: (await getVapid(env)).publicKey }));

    r.post('/api/push/subscribe', async ({ env, req }) => {
      const b = await readJson<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(req);
      const endpoint = str(b.endpoint, 'endpoint', { max: 1000 })!;
      if (!endpoint.startsWith('https://')) throw new HttpError(400, 'endpoint must be https');
      await run(
        env,
        `INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
        endpoint,
        str(b.keys?.p256dh, 'p256dh'),
        str(b.keys?.auth, 'auth'),
        nowIso(),
      );
      return json({ ok: true });
    });

    r.post('/api/push/unsubscribe', async ({ env, req }) => {
      const b = await readJson<{ endpoint?: string }>(req);
      await run(env, 'DELETE FROM push_subs WHERE endpoint = ?', b.endpoint ?? '');
      return json({ ok: true });
    });

    r.post('/api/push/test', async ({ env }) => {
      const delivered = await sendPush(env, { title: 'Planner', body: 'Notifications are working.', url: '/', tag: 'test' });
      return json({ delivered });
    });
  },
};

// Web Push. VAPID keys are generated on first use and stored in D1, so no manual key setup is needed.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { all, kvGet, kvSet, run, type Env } from './core';

interface VapidStored {
  publicKey: string; // base64url, 65-byte uncompressed point
  privateKey: string; // base64url "d"
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

export async function getVapid(env: Env): Promise<VapidStored> {
  const existing = await kvGet<VapidStored>(env, 'vapid');
  if (existing) return existing;
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const x = b64urlDecode(jwk.x!);
  const y = b64urlDecode(jwk.y!);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  const vapid = { publicKey: b64url(raw), privateKey: jwk.d! };
  await kvSet(env, 'vapid', vapid);
  return vapid;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Send to every registered device. Dead subscriptions (404/410) are removed. Returns count delivered. */
export async function sendPush(env: Env, payload: PushPayload): Promise<number> {
  const subs = await all<{ endpoint: string; p256dh: string; auth: string }>(env, 'SELECT * FROM push_subs');
  if (!subs.length) return 0;
  const vapid = await getVapid(env);
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const req = await buildPushPayload(
          { data: payload as unknown as Record<string, string>, options: { ttl: 3600, urgency: 'high' } },
          { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } },
          { subject: env.APP_URL, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        );
        const res = await fetch(s.endpoint, req);
        if (res.status === 404 || res.status === 410) {
          await run(env, 'DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
        } else if (res.ok) {
          delivered++;
        } else {
          console.warn('push failed', res.status, await res.text());
        }
      } catch (e) {
        console.warn('push error', String(e));
      }
    }),
  );
  return delivered;
}

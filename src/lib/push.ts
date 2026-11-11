// Browser side of Web Push.
import { api } from '../api';

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushStatus(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not granted');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api.post('/api/push/subscribe', sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

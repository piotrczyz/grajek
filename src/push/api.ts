/**
 * Client of the notification backend (`functions/`). Same-origin `/api` by
 * default (Firebase Hosting rewrite in production, Vite proxy in dev).
 * Each call returns the HTTP status; `push.ts` maps it to a result.
 */

export interface SubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function apiBase(): string {
  const base = import.meta.env.VITE_PUSH_API_BASE ?? '/api';
  return base.replace(/\/+$/, '');
}

function deviceUrl(deviceId: string, suffix = ''): string {
  return `${apiBase()}/devices/${encodeURIComponent(deviceId)}${suffix}`;
}

export async function putDevice(deviceId: string, subscription: SubscriptionJson): Promise<number> {
  const response = await fetch(deviceUrl(deviceId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // Only the subscription: no name, no user agent, nothing else (ADR 0001).
    body: JSON.stringify({
      subscription: { endpoint: subscription.endpoint, keys: subscription.keys },
    }),
  });
  return response.status;
}

export async function deleteDevice(deviceId: string): Promise<number> {
  const response = await fetch(deviceUrl(deviceId), { method: 'DELETE' });
  return response.status;
}

export async function postTestNotification(deviceId: string): Promise<number> {
  const response = await fetch(deviceUrl(deviceId, '/test'), { method: 'POST' });
  return response.status;
}

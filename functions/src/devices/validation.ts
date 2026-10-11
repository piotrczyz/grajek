import type { PushSubscriptionRecord } from './types.js';

/** Lower-case UUID v4, the shape `crypto.randomUUID()` produces. */
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** base64url, optionally padded (browsers emit it unpadded). */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 256;
const MAX_AUTH_LENGTH = 64;

/**
 * Push services the function may POST to. Anything else is rejected, so the
 * function can never be used to send requests to arbitrary URLs.
 */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function isAllowedPushHost(host: string): boolean {
  const h = host.toLowerCase();
  return EXACT_HOSTS.has(h) || HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

export function parseDeviceId(value: unknown): string | null {
  return typeof value === 'string' && DEVICE_ID.test(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseKey(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    return null;
  }
  return BASE64URL.test(value) ? value : null;
}

function parseEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null;
  }
  return isAllowedPushHost(url.hostname) ? value : null;
}

/**
 * Accepts `{ subscription: { endpoint, keys: { p256dh, auth } } }` and returns
 * only those fields. Every other field of the body is dropped.
 */
export function parseSubscription(body: unknown): PushSubscriptionRecord | null {
  if (!isRecord(body) || !isRecord(body.subscription)) {
    return null;
  }
  const { endpoint, keys } = body.subscription;
  if (!isRecord(keys)) {
    return null;
  }
  const parsedEndpoint = parseEndpoint(endpoint);
  const p256dh = parseKey(keys.p256dh, MAX_P256DH_LENGTH);
  const auth = parseKey(keys.auth, MAX_AUTH_LENGTH);
  if (!parsedEndpoint || !p256dh || !auth) {
    return null;
  }
  return { endpoint: parsedEndpoint, keys: { p256dh, auth } };
}

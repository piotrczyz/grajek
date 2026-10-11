import { beforeEach, describe, expect, it } from 'vitest';
import { createDevicesHandler, MAX_BODY_BYTES, TEST_PAYLOAD } from '../src/devices/handler.js';
import { createFirestoreRepository } from '../src/devices/repository.js';
import type { SendResult } from '../src/devices/push-sender.js';
import { createFakeFirestore, createFakeSender, createResponse, jsonRequest } from './fakes.js';

const ID = '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b';
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};
const ALLOWED_FIELDS = ['createdAt', 'lastTestAt', 'subscription', 'updatedAt'];

function setup(results: Array<SendResult | Error> = []) {
  const firestore = createFakeFirestore();
  const push = createFakeSender(results);
  let clock = new Date('2026-10-11T10:00:00Z');
  const handle = createDevicesHandler({
    repo: createFirestoreRepository(firestore.db),
    sender: push.sender,
    now: () => clock,
  });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = createResponse();
    await handle(jsonRequest(method, path, body), res);
    return res;
  };
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const stored = () => firestore.docs.get(`devices/${ID}`);
  return { handle, call, advance, stored, push, docs: firestore.docs };
}

describe('PUT /devices/{id} (register)', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('stores the subscription and answers 204', async () => {
    const res = await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    expect(res.statusCode).toBe(204);
    expect(t.stored()?.subscription).toEqual(SUBSCRIPTION);
  });

  it('works with the /api prefix used by the Hosting rewrite', async () => {
    const res = await t.call('PUT', `/api/devices/${ID}`, { subscription: SUBSCRIPTION });
    expect(res.statusCode).toBe(204);
    expect(t.stored()).toBeDefined();
  });

  it('is an upsert that keeps createdAt and bumps updatedAt', async () => {
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const first = t.stored();
    t.advance(5_000);
    const renewed = { ...SUBSCRIPTION, endpoint: 'https://fcm.googleapis.com/fcm/send/new' };
    const res = await t.call('PUT', `/devices/${ID}`, { subscription: renewed });
    expect(res.statusCode).toBe(204);
    const second = t.stored();
    expect(second?.createdAt).toEqual(first?.createdAt);
    expect(second?.updatedAt).not.toEqual(first?.updatedAt);
    expect((second?.subscription as typeof SUBSCRIPTION).endpoint).toBe(renewed.endpoint);
    expect(t.docs.size).toBe(1);
  });

  it('stores no field beyond subscription and the timestamps, even when the body has more', async () => {
    await t.call('PUT', `/devices/${ID}`, {
      subscription: { ...SUBSCRIPTION, expirationTime: null, keys: { ...SUBSCRIPTION.keys, x: 1 } },
      name: 'Ala',
      userAgent: 'Mozilla/5.0',
    });
    await t.call('POST', `/devices/${ID}/test`);
    const doc = t.stored() ?? {};
    expect(Object.keys(doc).every((field) => ALLOWED_FIELDS.includes(field))).toBe(true);
    expect(Object.keys(doc).sort()).toEqual(ALLOWED_FIELDS);
    expect(doc.subscription).toEqual(SUBSCRIPTION);
  });

  it.each([
    ['upper-case id', `/devices/${ID.toUpperCase()}`],
    ['not a uuid', '/devices/not-a-uuid'],
    ['uuid v1', '/devices/3f2b8c1e-9d4a-1f6b-8a2e-1c5d7e9f0a1b'],
  ])('rejects an invalid device id (%s) with 400', async (_name, path) => {
    const res = await t.call('PUT', path, { subscription: SUBSCRIPTION });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_device_id' });
    expect(t.docs.size).toBe(0);
  });

  it.each([
    ['no body', undefined],
    ['no subscription', {}],
    ['missing keys', { subscription: { endpoint: SUBSCRIPTION.endpoint } }],
    ['empty auth', { subscription: { ...SUBSCRIPTION, keys: { ...SUBSCRIPTION.keys, auth: '' } } }],
    ['non-base64url key', { subscription: { ...SUBSCRIPTION, keys: { ...SUBSCRIPTION.keys, p256dh: 'a b' } } }],
    ['http endpoint', { subscription: { ...SUBSCRIPTION, endpoint: 'http://fcm.googleapis.com/x' } }],
  ])('rejects an invalid body (%s) with 400', async (_name, body) => {
    const res = await t.call('PUT', `/devices/${ID}`, body ?? null);
    expect(res.statusCode).toBe(400);
    expect(t.docs.size).toBe(0);
  });

  it.each([
    'https://example.com/push',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilpush.apple.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://user:pw@fcm.googleapis.com/x',
    'https://169.254.169.254/latest',
  ])('rejects a non-allowlisted endpoint %s with 400', async (endpoint) => {
    const res = await t.call('PUT', `/devices/${ID}`, { subscription: { ...SUBSCRIPTION, endpoint } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_subscription' });
    expect(t.docs.size).toBe(0);
  });

  it.each([
    'https://web.push.apple.com/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts the known push service %s', async (endpoint) => {
    const res = await t.call('PUT', `/devices/${ID}`, { subscription: { ...SUBSCRIPTION, endpoint } });
    expect(res.statusCode).toBe(204);
  });

  it('rejects a body that is not application/json with 415', async () => {
    const res = createResponse();
    const req = jsonRequest('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    req.headers['content-type'] = 'text/plain';
    await t.handle(req, res);
    expect(res.statusCode).toBe(415);
  });

  it('rejects a body over 4 KB with 413', async () => {
    const res = await t.call('PUT', `/devices/${ID}`, {
      subscription: SUBSCRIPTION,
      padding: 'x'.repeat(MAX_BODY_BYTES),
    });
    expect(res.statusCode).toBe(413);
    expect(t.docs.size).toBe(0);
  });
});

describe('DELETE /devices/{id}', () => {
  it('removes the device and answers 204', async () => {
    const t = setup();
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const res = await t.call('DELETE', `/devices/${ID}`);
    expect(res.statusCode).toBe(204);
    expect(t.stored()).toBeUndefined();
  });

  it('is idempotent: deleting an unknown device also answers 204', async () => {
    const t = setup();
    expect((await t.call('DELETE', `/devices/${ID}`)).statusCode).toBe(204);
    expect((await t.call('DELETE', `/api/devices/${ID}`)).statusCode).toBe(204);
  });
});

describe('POST /devices/{id}/test', () => {
  it('sends the fixed Polish test notification and answers 202', async () => {
    const t = setup();
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const res = await t.call('POST', `/api/devices/${ID}/test`);
    expect(res.statusCode).toBe(202);
    expect(t.push.calls).toEqual([{ subscription: SUBSCRIPTION, payload: TEST_PAYLOAD }]);
    expect(TEST_PAYLOAD).toMatchObject({ title: 'Grajek', tag: 'grajek-test' });
    expect(t.stored()?.lastTestAt).toBeDefined();
  });

  it('answers 404 for an unknown device without sending', async () => {
    const t = setup();
    const res = await t.call('POST', `/devices/${ID}/test`);
    expect(res.statusCode).toBe(404);
    expect(t.push.calls).toHaveLength(0);
  });

  it('answers 429 within the 60 s cooldown without sending, and sends again after it', async () => {
    const t = setup();
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    expect((await t.call('POST', `/devices/${ID}/test`)).statusCode).toBe(202);
    t.advance(59_000);
    const res = await t.call('POST', `/devices/${ID}/test`);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'cooldown' });
    expect(t.push.calls).toHaveLength(1);
    t.advance(1_000);
    expect((await t.call('POST', `/devices/${ID}/test`)).statusCode).toBe(202);
    expect(t.push.calls).toHaveLength(2);
  });

  it('answers 410 and deletes the doc when the push service reports the subscription gone', async () => {
    const t = setup(['gone']);
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const res = await t.call('POST', `/devices/${ID}/test`);
    expect(res.statusCode).toBe(410);
    expect(t.stored()).toBeUndefined();
  });

  it('answers 502 when the push service fails otherwise, and keeps the device', async () => {
    const t = setup([new Error('push service down')]);
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const res = await t.call('POST', `/devices/${ID}/test`);
    expect(res.statusCode).toBe(502);
    expect(t.stored()?.lastTestAt).toBeUndefined();
  });
});

describe('routing', () => {
  it('answers 404 for unknown paths', async () => {
    const t = setup();
    expect((await t.call('GET', '/')).statusCode).toBe(404);
    expect((await t.call('PUT', '/api/users/x')).statusCode).toBe(404);
    expect((await t.call('POST', `/devices/${ID}/other`)).statusCode).toBe(404);
  });

  it('answers 405 for other methods on known paths', async () => {
    const t = setup();
    const res = await t.call('GET', `/devices/${ID}`);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PUT, DELETE');
    expect((await t.call('GET', `/devices/${ID}/test`)).statusCode).toBe(405);
    expect((await t.call('PUT', `/devices/${ID}/test`)).statusCode).toBe(405);
  });

  it('never lets responses be cached', async () => {
    const t = setup();
    const res = await t.call('DELETE', `/devices/${ID}`);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

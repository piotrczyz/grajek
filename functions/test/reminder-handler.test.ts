import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDevicesHandler, MAX_BODY_BYTES } from '../src/devices/handler.js';
import { createFirestoreRepository } from '../src/devices/repository.js';
import type { HttpRequest } from '../src/devices/handler.js';
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
const REMINDER = {
  timezone: 'Europe/Warsaw',
  times: { '1': '17:00', '3': '16:30' },
  practicedOn: null,
};
const PATH = `/devices/${ID}/reminder`;

function setup() {
  const firestore = createFakeFirestore();
  const push = createFakeSender();
  // Monday 2026-10-12, 10:00 in Warsaw.
  const clock = new Date('2026-10-12T08:00:00Z');
  const handle = createDevicesHandler({
    repo: createFirestoreRepository(firestore.db),
    sender: push.sender,
    now: () => clock,
  });
  const send = async (req: HttpRequest) => {
    const res = createResponse();
    await handle(req, res);
    return res;
  };
  const call = (method: string, path: string, body?: unknown) => send(jsonRequest(method, path, body));
  const stored = () => firestore.docs.get(`devices/${ID}`);
  return { call, send, stored, docs: firestore.docs };
}

describe('PUT /devices/{id}/reminder', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
  });

  it('stores the reminder state and the next reminder instant, answers 204', async () => {
    const res = await t.call('PUT', PATH, { ...REMINDER, practicedOn: '2026-10-12' });
    expect(res.statusCode).toBe(204);
    const doc = t.stored() ?? {};
    expect(doc.reminder).toEqual({ timezone: 'Europe/Warsaw', times: REMINDER.times });
    expect(doc.practicedOn).toBe('2026-10-12');
    expect((doc.nextReminderAt as Timestamp).toDate().toISOString()).toBe('2026-10-12T15:00:00.000Z');
    expect((doc.reminderUpdatedAt as Timestamp).toDate().toISOString()).toBe('2026-10-12T08:00:00.000Z');
    expect(doc.lastReminderDay).toBeUndefined();
  });

  it('works with the /api prefix', async () => {
    const res = await t.call('PUT', `/api${PATH}`, REMINDER);
    expect(res.statusCode).toBe(204);
  });

  it('stores only the allowed fields and drops unknown ones', async () => {
    await t.call('PUT', PATH, { ...REMINDER, place: 'Kuchnia', name: 'Ala', practices: [1] });
    expect(Object.keys(t.stored() ?? {}).sort()).toEqual([
      'createdAt',
      'nextReminderAt',
      'practicedOn',
      'reminder',
      'reminderUpdatedAt',
      'subscription',
      'updatedAt',
    ]);
    expect(Object.keys(t.stored()?.reminder as object).sort()).toEqual(['times', 'timezone']);
  });

  it('overwrites the previous state and removes nextReminderAt when times are empty', async () => {
    await t.call('PUT', PATH, REMINDER);
    expect(t.stored()?.nextReminderAt).toBeDefined();
    const res = await t.call('PUT', PATH, { ...REMINDER, times: {} });
    expect(res.statusCode).toBe(204);
    expect(t.stored()?.reminder).toEqual({ timezone: 'Europe/Warsaw', times: {} });
    expect(t.stored()).not.toHaveProperty('nextReminderAt');
  });

  it('keeps the reminder fields when the device re-registers', async () => {
    await t.call('PUT', PATH, REMINDER);
    const before = t.stored();
    await t.call('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION });
    const after = t.stored();
    expect(after?.reminder).toEqual(before?.reminder);
    expect(after?.nextReminderAt).toEqual(before?.nextReminderAt);
    expect(after?.practicedOn).toBe(null);
  });

  it('drops every reminder field when the device is deleted', async () => {
    await t.call('PUT', PATH, REMINDER);
    await t.call('DELETE', `/devices/${ID}`);
    expect(t.stored()).toBeUndefined();
  });

  it.each([
    ['an unknown zone', { ...REMINDER, timezone: 'Mars/Olympus' }],
    ['a too long zone', { ...REMINDER, timezone: 'A'.repeat(65) }],
    ['a missing zone', { times: REMINDER.times, practicedOn: null }],
    ['a weekday key out of range', { ...REMINDER, times: { '8': '17:00' } }],
    ['a non-numeric key', { ...REMINDER, times: { mon: '17:00' } }],
    ['an invalid time', { ...REMINDER, times: { '1': '24:00' } }],
    ['a time without leading zero', { ...REMINDER, times: { '1': '7:00' } }],
    ['times as an array', { ...REMINDER, times: ['17:00'] }],
    ['an impossible date', { ...REMINDER, practicedOn: '2026-02-30' }],
    ['a malformed date', { ...REMINDER, practicedOn: '12.10.2026' }],
    ['a missing practicedOn', { timezone: 'Europe/Warsaw', times: {} }],
    ['a non-object body', ['x']],
  ])('answers 400 invalid_reminder for %s and stores nothing', async (_label, body) => {
    const res = await t.call('PUT', PATH, body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_reminder' });
    expect(t.stored()).not.toHaveProperty('reminder');
  });

  it('answers 400 invalid_device_id for a malformed id', async () => {
    const res = await t.call('PUT', '/devices/not-a-uuid/reminder', REMINDER);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_device_id' });
  });

  it('answers 404 unknown_device and creates no doc for an unregistered device', async () => {
    const other = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
    const res = await t.call('PUT', `/devices/${other}/reminder`, REMINDER);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_device' });
    expect(t.docs.has(`devices/${other}`)).toBe(false);
  });

  it.each(['GET', 'POST', 'DELETE'])('answers 405 with Allow: PUT for %s', async (method) => {
    const res = await t.call(method, PATH);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PUT');
  });

  it('answers 415 for a body that is not application/json', async () => {
    const req = jsonRequest('PUT', PATH, REMINDER);
    req.headers['content-type'] = 'text/plain';
    const res = await t.send(req);
    expect(res.statusCode).toBe(415);
  });

  it('answers 413 for a body over 4 KB', async () => {
    const res = await t.call('PUT', PATH, { ...REMINDER, padding: 'x'.repeat(MAX_BODY_BYTES) });
    expect(res.statusCode).toBe(413);
    expect(t.stored()).not.toHaveProperty('reminder');
  });

  it('leaves the existing routes as they were', async () => {
    expect((await t.call('GET', `/devices/${ID}`)).headers.allow).toBe('PUT, DELETE');
    expect((await t.call('GET', `/devices/${ID}/test`)).headers.allow).toBe('POST');
    expect((await t.call('PUT', `/devices/${ID}/other`, REMINDER)).statusCode).toBe(404);
  });
});

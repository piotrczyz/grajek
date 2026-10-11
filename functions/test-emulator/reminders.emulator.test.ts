/**
 * The daily reminder end to end on the emulators (project `demo-grajek`):
 * the real `api` stores the reminder state, then one scheduler pass
 * (`runReminderTick`) runs from this process against the Firestore emulator
 * with a recording sender and a fixed `now`. Run through `pnpm test:emulators`.
 */
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLogSender } from '../src/devices/push-sender.js';
import { REMINDER_TAG } from '../src/reminders/messages.js';
import { createFirestoreReminderRepository } from '../src/reminders/repository.js';
import { runReminderTick } from '../src/reminders/tick.js';

const PROJECT = 'demo-grajek';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const API = `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api`;
const DOCS = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const KEYS = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

interface FirestoreDoc {
  fields: Record<string, { timestampValue?: string; stringValue?: string; nullValue?: null; mapValue?: unknown }>;
}

function put(path: string, body: unknown) {
  return fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function storedDoc(id: string): Promise<FirestoreDoc | null> {
  const response = await fetch(`${DOCS}/devices/${id}`, { headers: { Authorization: 'Bearer owner' } });
  if (response.status === 404) {
    return null;
  }
  expect(response.status).toBe(200);
  return (await response.json()) as FirestoreDoc;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A device with a reminder every day, in UTC, two minutes from now; returns
 * its id, endpoint, the stored slot and that slot's day.
 */
async function deviceWithReminder(practicedToday: boolean) {
  const id = randomUUID();
  const endpoint = `https://fcm.googleapis.com/fcm/send/reminder-${id}`;
  expect((await put(`/devices/${id}`, { subscription: { endpoint, keys: KEYS } })).status).toBe(204);
  const target = new Date(Date.now() + 2 * 60_000);
  const time = `${pad(target.getUTCHours())}:${pad(target.getUTCMinutes())}`;
  const day = target.toISOString().slice(0, 10);
  const times = Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((d) => [d, time]));
  const body = { timezone: 'Etc/UTC', times, practicedOn: practicedToday ? day : null, place: 'Kuchnia' };
  expect((await put(`/devices/${id}/reminder`, body)).status).toBe(204);
  const doc = await storedDoc(id);
  const slot = new Date(doc?.fields.nextReminderAt.timestampValue as string);
  return { id, endpoint, slot, day, doc };
}

function tickAt(now: Date) {
  const sender = createLogSender();
  const run = runReminderTick({
    repo: createFirestoreReminderRepository(getFirestore()),
    sender,
    now: () => now,
  });
  return run.then((result) => ({ result, calls: sender.calls }));
}

beforeAll(async () => {
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT });
  }
  // The first request also waits for the function to finish loading.
  const response = await fetch(`${API}/devices/not-a-uuid`, { method: 'DELETE' });
  expect(response.status).toBe(400);
});

describe('daily reminder on the emulators', () => {
  it('stores only the reminder fields through the api', async () => {
    const { doc, day } = await deviceWithReminder(false);
    expect(Object.keys(doc?.fields ?? {}).sort()).toEqual([
      'createdAt',
      'nextReminderAt',
      'practicedOn',
      'reminder',
      'reminderUpdatedAt',
      'subscription',
      'updatedAt',
    ]);
    expect(doc?.fields.practicedOn.nullValue).toBeNull();
    expect(doc?.fields.nextReminderAt.timestampValue?.slice(0, 10)).toBe(day);
  });

  it('answers 404 for a reminder of an unknown device and creates no doc', async () => {
    const id = randomUUID();
    const response = await put(`/devices/${id}/reminder`, { timezone: 'Etc/UTC', times: {}, practicedOn: null });
    expect(response.status).toBe(404);
    expect(await storedDoc(id)).toBeNull();
  });

  it('sends one reminder at the slot and no second one the same day', async () => {
    const { id, endpoint, slot, day } = await deviceWithReminder(false);
    const first = await tickAt(new Date(slot.getTime() + 60_000));
    const mine = first.calls.filter((c) => c.endpoint === endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0].payload.tag).toBe(REMINDER_TAG);

    const after = await storedDoc(id);
    expect(after?.fields.lastReminderDay.stringValue).toBe(day);
    expect(new Date(after?.fields.nextReminderAt.timestampValue as string).getTime()).toBeGreaterThan(slot.getTime());

    const second = await tickAt(new Date(slot.getTime() + 6 * 60_000));
    expect(second.calls.filter((c) => c.endpoint === endpoint)).toHaveLength(0);
  });

  it('sends nothing when a practice was logged that day', async () => {
    const { id, endpoint, slot } = await deviceWithReminder(true);
    const { calls } = await tickAt(new Date(slot.getTime() + 60_000));
    expect(calls.filter((c) => c.endpoint === endpoint)).toHaveLength(0);
    const after = await storedDoc(id);
    expect(after?.fields.lastReminderDay).toBeUndefined();
    expect(new Date(after?.fields.nextReminderAt.timestampValue as string).getTime()).toBeGreaterThan(slot.getTime());
  });
});

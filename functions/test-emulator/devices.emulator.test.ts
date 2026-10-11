/**
 * The real `api` function on the Functions emulator, with the Firestore
 * emulator behind it, under the offline demo project `demo-grajek`.
 * Run through `pnpm test:emulators`; pushes go to the recording log sender.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const PROJECT = 'demo-grajek';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const API = `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api`;
const DOCS = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/emulator-test',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};

interface FirestoreDoc {
  fields: Record<string, { timestampValue?: string; mapValue?: unknown }>;
}

function register(id: string, body: unknown = { subscription: SUBSCRIPTION }) {
  return fetch(`${API}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Reads the stored doc straight from the Firestore emulator (owner token bypasses rules). */
async function storedDoc(id: string): Promise<FirestoreDoc | null> {
  const response = await fetch(`${DOCS}/devices/${id}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (response.status === 404) {
    return null;
  }
  expect(response.status).toBe(200);
  return (await response.json()) as FirestoreDoc;
}

beforeAll(async () => {
  // The first request also waits for the function to finish loading.
  const response = await fetch(`${API}/devices/not-a-uuid`, { method: 'DELETE' });
  expect(response.status).toBe(400);
});

describe('devices api on the emulators', () => {
  it('registers a device with only the allowed fields, and re-registering keeps createdAt', async () => {
    const id = randomUUID();
    expect((await register(id, { subscription: SUBSCRIPTION, name: 'Ala' })).status).toBe(204);

    const first = await storedDoc(id);
    expect(Object.keys(first?.fields ?? {}).sort()).toEqual(['createdAt', 'subscription', 'updatedAt']);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await register(id)).status).toBe(204);
    const second = await storedDoc(id);
    expect(second?.fields.createdAt.timestampValue).toBe(first?.fields.createdAt.timestampValue);
    expect(second?.fields.updatedAt.timestampValue).not.toBe(first?.fields.updatedAt.timestampValue);
  });

  it('sends a test notification (202), then answers 429 within the cooldown', async () => {
    const id = randomUUID();
    await register(id);
    expect((await fetch(`${API}/devices/${id}/test`, { method: 'POST' })).status).toBe(202);
    expect((await storedDoc(id))?.fields.lastTestAt?.timestampValue).toBeDefined();
    expect((await fetch(`${API}/devices/${id}/test`, { method: 'POST' })).status).toBe(429);
  });

  it('answers 404 for a test on an unknown device', async () => {
    const response = await fetch(`${API}/devices/${randomUUID()}/test`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  it('deletes the device doc', async () => {
    const id = randomUUID();
    await register(id);
    expect(await storedDoc(id)).not.toBeNull();
    expect((await fetch(`${API}/devices/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await storedDoc(id)).toBeNull();
    expect((await fetch(`${API}/devices/${id}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('rejects a non-allowlisted endpoint with 400 and stores nothing', async () => {
    const id = randomUUID();
    const response = await register(id, {
      subscription: { ...SUBSCRIPTION, endpoint: 'https://example.com/push' },
    });
    expect(response.status).toBe(400);
    expect(await storedDoc(id)).toBeNull();
  });

  it('serves the /api-prefixed path the Hosting rewrite forwards', async () => {
    const id = randomUUID();
    const response = await fetch(
      `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api/api/devices/${id}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(204);
  });
});

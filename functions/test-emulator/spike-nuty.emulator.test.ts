/**
 * Spike telemetry routes of the real `api` function on the Functions
 * emulator, with the Firestore emulator behind it (project `demo-grajek`).
 * Run through `pnpm test:emulators`.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { sampleAttempt, sampleFullAttempt } from '../test/spike-nuty-fakes.js';

const PROJECT = 'demo-grajek';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const API = `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api`;
const DOCS = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FirestoreValue {
  timestampValue?: string;
  stringValue?: string;
  booleanValue?: boolean;
  doubleValue?: number;
  /** Firestore REST sends integers as strings. */
  integerValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
}

interface FirestoreDoc {
  fields: Record<string, FirestoreValue>;
}

function put(path: string, body: unknown) {
  return fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const putAttempt = (id: string, body: unknown) => put(`/spike-nuty/attempts/${id}`, body);

/** Reads the stored doc straight from the Firestore emulator (owner token bypasses rules). */
async function storedAttempt(id: string): Promise<FirestoreDoc | null> {
  const response = await fetch(`${DOCS}/spikeNutyAttempts/${id}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  if (response.status === 404) {
    return null;
  }
  expect(response.status).toBe(200);
  return (await response.json()) as FirestoreDoc;
}

const time = (value: FirestoreValue | undefined) => Date.parse(value?.timestampValue ?? '');

beforeAll(async () => {
  // The first request also waits for the function to finish loading.
  const response = await putAttempt('not-a-uuid', {});
  expect(response.status).toBe(400);
});

describe('spike-nuty api on the emulators', () => {
  it('stores only the whitelisted fields plus receivedAt and expireAt about 180 days later', async () => {
    const id = randomUUID();
    const deviceId = randomUUID();
    const response = await putAttempt(id, { ...sampleAttempt({ deviceId }), name: 'Ala', audio: 'x' });
    expect(response.status).toBe(204);

    const doc = await storedAttempt(id);
    expect(Object.keys(doc?.fields ?? {}).sort()).toEqual(
      [...Object.keys(sampleAttempt()), 'receivedAt', 'expireAt'].sort(),
    );
    expect(doc?.fields.deviceId.stringValue).toBe(deviceId);
    const receivedAt = time(doc?.fields.receivedAt);
    expect(Math.abs(receivedAt - Date.now())).toBeLessThan(60_000);
    expect(time(doc?.fields.expireAt) - receivedAt).toBe(180 * DAY_MS);
  });

  it('keeps the first document on a retry of the same attempt', async () => {
    const id = randomUUID();
    const deviceId = randomUUID();
    expect((await putAttempt(id, sampleAttempt({ deviceId }))).status).toBe(204);
    const first = await storedAttempt(id);

    expect((await putAttempt(id, sampleAttempt({ deviceId, ended: 'stopped' }))).status).toBe(204);
    const second = await storedAttempt(id);
    expect(second?.fields.ended.stringValue).toBe('complete');
    expect(second?.fields.receivedAt.timestampValue).toBe(first?.fields.receivedAt.timestampValue);
  });

  it('stores the optional signal, estimate, windowLevelDb and pitchSpreadCents fields', async () => {
    const id = randomUUID();
    const body = sampleFullAttempt({ deviceId: randomUUID() });
    expect((await putAttempt(id, body)).status).toBe(204);

    const fields = (await storedAttempt(id))?.fields ?? {};
    const estimate = fields.estimate?.mapValue?.fields ?? {};
    const sent = body.estimate as { heuristicVersion: string; notes: unknown[]; events: unknown[] };
    expect(estimate.heuristicVersion?.stringValue).toBe(sent.heuristicVersion);
    expect(estimate.estimatedAccuracy?.doubleValue).toBe(0.333);
    expect(estimate.notes?.arrayValue?.values).toHaveLength(sent.notes.length);
    expect(estimate.events?.arrayValue?.values).toHaveLength(sent.events.length);
    expect(estimate.signals?.mapValue?.fields?.stopped?.booleanValue).toBe(false);
    expect(Number(estimate.reasons?.mapValue?.fields?.missingLoud?.integerValue)).toBe(1);
    expect(Number(fields.signal?.mapValue?.fields?.voicedFrames?.integerValue)).toBe(410);
    const note = fields.notes?.arrayValue?.values?.[2]?.mapValue?.fields ?? {};
    expect(note.windowLevelDb?.doubleValue).toBe(-18.5);
    const event = fields.events?.arrayValue?.values?.[0]?.mapValue?.fields ?? {};
    expect(event.pitchSpreadCents?.doubleValue).toBe(14.5);
  });

  it('answers 404 to the removed feedback path', async () => {
    const id = randomUUID();
    const deviceId = randomUUID();
    await putAttempt(id, sampleAttempt({ deviceId }));
    const response = await put(`/spike-nuty/attempts/${id}/feedback`, { v: 1, deviceId, agrees: true, misjudged: [], regraded: false });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect((await storedAttempt(id))?.fields.feedback).toBeUndefined();
  });

  it('rejects 201 events with 400 and stores nothing', async () => {
    const id = randomUUID();
    const event = (sampleAttempt().events as unknown[])[0];
    const body = sampleAttempt({ deviceId: randomUUID(), events: Array.from({ length: 201 }, () => event) });
    const response = await putAttempt(id, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_attempt' });
    expect(await storedAttempt(id)).toBeNull();
  });

  it('answers 429 with Retry-After to the 61st write of one device within the hour', async () => {
    const deviceId = randomUUID();
    for (let i = 0; i < 60; i += 1) {
      expect((await putAttempt(randomUUID(), sampleAttempt({ deviceId }))).status).toBe(204);
    }
    const id = randomUUID();
    const response = await putAttempt(id, sampleAttempt({ deviceId }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await storedAttempt(id)).toBeNull();
  });

  it('serves the /api-prefixed path the Hosting rewrite forwards', async () => {
    const response = await fetch(
      `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api/api/spike-nuty/attempts/${randomUUID()}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sampleAttempt({ deviceId: randomUUID() })) },
    );
    expect(response.status).toBe(204);
  });
});

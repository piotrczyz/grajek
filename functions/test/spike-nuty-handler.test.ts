import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { HttpRequest } from '../src/http.js';
import { createSpikeNutyHandler, DEFAULT_RATE_LIMIT } from '../src/spike-nuty/handler.js';
import {
  ATTEMPTS_COLLECTION,
  createFirestoreSpikeNutyRepository,
  RATE_LIMITS_COLLECTION,
  TTL_DAYS,
  type SpikeNutyRepository,
} from '../src/spike-nuty/repository.js';
import { MAX_ATTEMPT_BYTES, MAX_EVENTS, MAX_FEEDBACK_BYTES, MAX_NOTES } from '../src/spike-nuty/validation.js';
import { createFakeFirestore, createResponse, jsonRequest } from './fakes.js';
import {
  ATTEMPT_ID,
  createMemorySpikeNutyRepository,
  DEVICE_ID,
  OTHER_DEVICE_ID,
  sampleAttempt,
  sampleFeedback,
} from './spike-nuty-fakes.js';

const START = new Date('2026-11-15T10:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_PATH = `/api/spike-nuty/attempts/${ATTEMPT_ID}`;
const FEEDBACK_PATH = `${ATTEMPT_PATH}/feedback`;

function makeHandler(repo: SpikeNutyRepository, rateLimit?: { limit: number; windowMs: number }) {
  let clock = START;
  const errors: unknown[] = [];
  const handle = createSpikeNutyHandler({ repo, now: () => clock, onError: (e) => errors.push(e), rateLimit });
  const send = async (req: HttpRequest) => {
    const res = createResponse();
    await handle(req, res);
    return res;
  };
  const call = (method: string, path: string, body?: unknown) => send(jsonRequest(method, path, body));
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { call, send, advance, errors };
}

function setup(rateLimit?: { limit: number; windowMs: number }) {
  const memory = createMemorySpikeNutyRepository();
  return { ...memory, ...makeHandler(memory.repo, rateLimit) };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('PUT /spike-nuty/attempts/{id}', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('stores the whitelisted record with receivedAt and expireAt and answers 204', async () => {
    const res = await t.call('PUT', ATTEMPT_PATH, { ...sampleAttempt(), name: 'Ala' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const stored = t.attempts.get(ATTEMPT_ID);
    expect(stored).toEqual({
      ...sampleAttempt(),
      receivedAt: START,
      expireAt: new Date(START.getTime() + TTL_DAYS * DAY_MS),
    });
  });

  it('works without the /api prefix and with a trailing slash', async () => {
    expect((await t.call('PUT', `/spike-nuty/attempts/${ATTEMPT_ID}/`, sampleAttempt())).statusCode).toBe(204);
  });

  it('is idempotent: a retry answers 204, keeps the first document and is not counted again', async () => {
    await t.call('PUT', ATTEMPT_PATH, sampleAttempt());
    const first = t.attempts.get(ATTEMPT_ID);
    t.advance(5_000);
    const res = await t.call('PUT', ATTEMPT_PATH, sampleAttempt({ ended: 'stopped' }));
    expect(res.statusCode).toBe(204);
    expect(t.attempts.get(ATTEMPT_ID)).toEqual(first);
    expect(t.windows.get(DEVICE_ID)?.count).toBe(1);
  });

  it('accepts a valid record at the caps (400 notes, 200 events) that is over 64 KiB', async () => {
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => ({
      nr: i + 1,
      refIndex: i < 16 ? i : null,
      playedIndex: i,
      expectedMidi: i < 16 ? 67 : null,
      playedMidi: 71,
      centsDiff: -12.345678901234,
      offsetMs: -123.45678901234,
      status: i < 16 ? 'wrongPitch' : 'extra',
      octaveOff: false,
      twelfthOff: true,
    }));
    const events = Array.from({ length: MAX_EVENTS }, (_, i) => ({
      midi: 71,
      startMs: 12345.678901234 + i,
      durationMs: 480.12345678901,
      meanCents: -12.345678901234,
      meanClarity: 0.93456789012345,
      meanLevelDb: -21.345678901234,
      frames: 40,
      suspectOctave: 3,
      suspectTwelfth: 1,
    }));
    const body = sampleAttempt({ notes, events });
    expect(JSON.stringify(body).length).toBeGreaterThan(65536);
    const res = await t.call('PUT', ATTEMPT_PATH, body);
    expect(res.statusCode).toBe(204);
    expect((t.attempts.get(ATTEMPT_ID) as { notes: unknown[] }).notes).toHaveLength(MAX_NOTES);
  });

  it('answers 413 for a body over 128 KiB before parsing it', async () => {
    const res = await t.call('PUT', ATTEMPT_PATH, { ...sampleAttempt(), pad: 'x'.repeat(MAX_ATTEMPT_BYTES) });
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: 'body_too_large' });
    expect(t.attempts.size).toBe(0);
  });

  it('answers 415 for a non-JSON body', async () => {
    const req = jsonRequest('PUT', ATTEMPT_PATH, sampleAttempt());
    req.headers['content-type'] = 'text/plain';
    const res = await t.send(req);
    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported_media_type' });
  });

  it('answers 400 invalid_attempt for an invalid record and stores nothing', async () => {
    const res = await t.call('PUT', ATTEMPT_PATH, sampleAttempt({ ended: 'aborted' }));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_attempt' });
    expect(t.attempts.size).toBe(0);
    expect(t.calls.hitRateLimit).toBe(0);
  });

  it('answers 400 for an attempt id that is not a UUID v4', async () => {
    const res = await t.call('PUT', '/spike-nuty/attempts/not-a-uuid', sampleAttempt());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_attempt_id' });
  });

  it.each(['GET', 'POST', 'DELETE'])('answers 405 with Allow: PUT for %s', async (method) => {
    const res = await t.call(method, ATTEMPT_PATH);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PUT');
  });

  it('answers 404 for an unknown spike-nuty path', async () => {
    const res = await t.call('PUT', '/spike-nuty/other', sampleAttempt());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('answers 500 internal and reports the error when the repository fails', async () => {
    const failing = createMemorySpikeNutyRepository();
    failing.repo.createIfAbsent = async () => {
      throw new Error('boom');
    };
    const h = makeHandler(failing.repo);
    const res = await h.call('PUT', ATTEMPT_PATH, sampleAttempt());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal' });
    expect(h.errors).toHaveLength(1);
  });
});

describe('PUT /spike-nuty/attempts/{id}/feedback', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(async () => {
    t = setup();
    await t.call('PUT', ATTEMPT_PATH, sampleAttempt());
  });

  it('stores the feedback map and feedbackAt and answers 204', async () => {
    t.advance(60_000);
    const res = await t.call('PUT', FEEDBACK_PATH, { ...sampleFeedback(), extra: 1 });
    expect(res.statusCode).toBe(204);
    const stored = t.attempts.get(ATTEMPT_ID);
    expect(stored?.feedback).toEqual({
      agrees: false,
      misjudged: sampleFeedback().misjudged,
      comment: 'grałam dobrze',
      regraded: false,
    });
    expect(stored?.feedbackAt).toEqual(new Date(START.getTime() + 60_000));
  });

  it('replaces an earlier answer', async () => {
    await t.call('PUT', FEEDBACK_PATH, sampleFeedback());
    await t.call('PUT', FEEDBACK_PATH, sampleFeedback({ agrees: true, misjudged: [], comment: undefined }));
    expect(t.attempts.get(ATTEMPT_ID)?.feedback).toEqual({ agrees: true, misjudged: [], regraded: false });
  });

  it('answers 404 unknown_attempt for an unknown attempt id', async () => {
    const res = await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}/feedback`, sampleFeedback());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_attempt' });
  });

  it('answers 404 unknown_attempt for another device and writes nothing', async () => {
    const before = t.attempts.get(ATTEMPT_ID);
    const res = await t.call('PUT', FEEDBACK_PATH, sampleFeedback({ deviceId: OTHER_DEVICE_ID }));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'unknown_attempt' });
    expect(t.attempts.get(ATTEMPT_ID)).toEqual(before);
  });

  it('answers 400 invalid_feedback for agrees with misjudged notes', async () => {
    const res = await t.call('PUT', FEEDBACK_PATH, sampleFeedback({ agrees: true }));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_feedback' });
  });

  it('answers 413 for a body over 8 KiB', async () => {
    const res = await t.call('PUT', FEEDBACK_PATH, { ...sampleFeedback(), pad: 'x'.repeat(MAX_FEEDBACK_BYTES) });
    expect(res.statusCode).toBe(413);
  });

  it('answers 415 for a non-JSON body', async () => {
    const req = jsonRequest('PUT', FEEDBACK_PATH, sampleFeedback());
    req.headers['content-type'] = 'application/x-www-form-urlencoded';
    expect((await t.send(req)).statusCode).toBe(415);
  });

  it('answers 405 for POST', async () => {
    const res = await t.call('POST', FEEDBACK_PATH, sampleFeedback());
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('PUT');
  });
});

describe('per-device rate limit', () => {
  it('defaults to 60 writes per hour', () => {
    expect(DEFAULT_RATE_LIMIT).toEqual({ limit: 60, windowMs: 60 * 60 * 1000 });
  });

  it('answers 429 with Retry-After after the limit, counting attempts and feedback together', async () => {
    const t = setup({ limit: 3, windowMs: 60_000 });
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt())).statusCode).toBe(204);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}/feedback`, sampleFeedback())).statusCode).toBe(204);
    t.advance(10_000);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt())).statusCode).toBe(204);

    const res = await t.call('PUT', `/spike-nuty/attempts/${uuid(3)}`, sampleAttempt());
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(res.headers['retry-after']).toBe('50');
    expect(t.attempts.has(uuid(3))).toBe(false);

    const feedback = await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}/feedback`, sampleFeedback());
    expect(feedback.statusCode).toBe(429);
    expect(t.attempts.get(uuid(2))?.feedback).toBeUndefined();
  });

  it('still answers 204 to a retry of a stored attempt when the limit is reached', async () => {
    const t = setup({ limit: 1, windowMs: 60_000 });
    await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt());
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt())).statusCode).toBe(204);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt())).statusCode).toBe(429);
  });

  it('limits each device separately', async () => {
    const t = setup({ limit: 1, windowMs: 60_000 });
    await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt());
    const other = await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt({ deviceId: OTHER_DEVICE_ID }));
    expect(other.statusCode).toBe(204);
  });

  it('opens a new window once the old one has passed', async () => {
    const t = setup({ limit: 1, windowMs: 60_000 });
    await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt());
    t.advance(59_999);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt())).statusCode).toBe(429);
    t.advance(1);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt())).statusCode).toBe(204);
    expect(t.windows.get(DEVICE_ID)).toEqual({ windowStart: new Date(START.getTime() + 60_000), count: 1 });
  });
});

describe('Firestore repository (through the handler)', () => {
  function firestoreSetup(rateLimit?: { limit: number; windowMs: number }) {
    const firestore = createFakeFirestore();
    const h = makeHandler(createFirestoreSpikeNutyRepository(firestore.db), rateLimit);
    const doc = (collection: string, id: string) => firestore.docs.get(`${collection}/${id}`);
    return { ...h, doc };
  }

  it('writes the record with Timestamp receivedAt and expireAt 180 days later', async () => {
    const t = firestoreSetup();
    expect((await t.call('PUT', ATTEMPT_PATH, sampleAttempt())).statusCode).toBe(204);
    const stored = t.doc(ATTEMPTS_COLLECTION, ATTEMPT_ID) ?? {};
    const { receivedAt, expireAt, ...record } = stored;
    expect(record).toEqual(sampleAttempt());
    expect((receivedAt as Timestamp).toDate()).toEqual(START);
    expect((expireAt as Timestamp).toDate()).toEqual(new Date(START.getTime() + 180 * DAY_MS));
  });

  it('keeps the first document on a retry and stores feedback only for the same device', async () => {
    const t = firestoreSetup();
    await t.call('PUT', ATTEMPT_PATH, sampleAttempt());
    const first = t.doc(ATTEMPTS_COLLECTION, ATTEMPT_ID);
    expect((await t.call('PUT', ATTEMPT_PATH, sampleAttempt({ ended: 'stopped' }))).statusCode).toBe(204);
    expect(t.doc(ATTEMPTS_COLLECTION, ATTEMPT_ID)).toEqual(first);

    expect((await t.call('PUT', FEEDBACK_PATH, sampleFeedback({ deviceId: OTHER_DEVICE_ID }))).statusCode).toBe(404);
    expect((await t.call('PUT', FEEDBACK_PATH, sampleFeedback())).statusCode).toBe(204);
    const stored = t.doc(ATTEMPTS_COLLECTION, ATTEMPT_ID) ?? {};
    expect(stored.feedback).toEqual({
      agrees: false,
      misjudged: sampleFeedback().misjudged,
      comment: 'grałam dobrze',
      regraded: false,
    });
    expect((stored.feedbackAt as Timestamp).toDate()).toEqual(START);
  });

  it('keeps the rate-limit counter with a window start and an expireAt one day after the window', async () => {
    const t = firestoreSetup({ limit: 2, windowMs: 60_000 });
    await t.call('PUT', `/spike-nuty/attempts/${uuid(1)}`, sampleAttempt());
    await t.call('PUT', `/spike-nuty/attempts/${uuid(2)}`, sampleAttempt());
    const counter = t.doc(RATE_LIMITS_COLLECTION, DEVICE_ID) ?? {};
    expect(counter.count).toBe(2);
    expect((counter.windowStart as Timestamp).toDate()).toEqual(START);
    expect((counter.expireAt as Timestamp).toDate()).toEqual(new Date(START.getTime() + 60_000 + DAY_MS));

    t.advance(30_000);
    const res = await t.call('PUT', `/spike-nuty/attempts/${uuid(3)}`, sampleAttempt());
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('30');

    t.advance(30_000);
    expect((await t.call('PUT', `/spike-nuty/attempts/${uuid(3)}`, sampleAttempt())).statusCode).toBe(204);
    expect(t.doc(RATE_LIMITS_COLLECTION, DEVICE_ID)?.count).toBe(1);
  });
});

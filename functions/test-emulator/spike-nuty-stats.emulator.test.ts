/**
 * Owner stats and export of the real `api` function on the Functions
 * emulator, with the Firestore emulator behind it (project `demo-grajek`).
 * Attempts and feedback are seeded through the public PUT routes. Run
 * through `pnpm test:emulators`, which makes sure `.secret.local` holds the
 * dummy `SPIKE_NUTY_ADMIN_KEY` of `.secret.local.example`.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { sampleAttempt, sampleFeedback } from '../test/spike-nuty-fakes.js';

const PROJECT = 'demo-grajek';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const API = `http://${FUNCTIONS_HOST}/${PROJECT}/europe-central2/api`;
const DATABASE = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The admin key the emulator loaded: `.secret.local` (created from the example), else the example. */
function adminKey(): string {
  for (const name of ['../.secret.local', '../.secret.local.example']) {
    const path = fileURLToPath(new URL(name, import.meta.url));
    if (existsSync(path)) {
      const line = readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('SPIKE_NUTY_ADMIN_KEY='));
      if (line) {
        return line.slice('SPIKE_NUTY_ADMIN_KEY='.length).trim();
      }
    }
  }
  throw new Error('SPIKE_NUTY_ADMIN_KEY not found in .secret.local or .secret.local.example');
}

const KEY = adminKey();
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

function put(path: string, body: unknown) {
  return fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string, key: string | null = KEY) {
  return fetch(`${API}${path}`, { headers: key === null ? {} : { 'X-Admin-Key': key } });
}

const devices = [randomUUID(), randomUUID()];
const attempts = [randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  // Start from an empty database so the counts are exact.
  expect((await fetch(DATABASE, { method: 'DELETE' })).status).toBe(200);
  // The first request also waits for the function to finish loading.
  expect((await get('/spike-nuty/stats', null)).status).toBe(401);

  const scores = [95, 40, 72];
  for (const [i, id] of attempts.entries()) {
    const body = sampleAttempt({
      deviceId: devices[i === 2 ? 1 : 0],
      ended: i === 1 ? 'stopped' : 'complete',
      result: { ...(sampleAttempt().result as object), scorePercent: scores[i] },
    });
    expect((await put(`/spike-nuty/attempts/${id}`, body)).status).toBe(204);
  }
  // Attempt 0: the app misjudged note refIndex 1 (expected MIDI 64); attempt 2: the grading was right.
  expect(
    (
      await put(
        `/spike-nuty/attempts/${attempts[0]}/feedback`,
        sampleFeedback({ deviceId: devices[0], misjudged: [{ refIndex: 1, playedIndex: 1 }] }),
      )
    ).status,
  ).toBe(204);
  expect(
    (
      await put(
        `/spike-nuty/attempts/${attempts[2]}/feedback`,
        sampleFeedback({ deviceId: devices[1], agrees: true, misjudged: [], comment: undefined }),
      )
    ).status,
  ).toBe(204);
});

describe('spike-nuty owner endpoints on the emulators', () => {
  it('returns the expected aggregates for the seeded attempts', async () => {
    const response = await get('/spike-nuty/stats');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const stats = (await response.json()) as Record<string, unknown>;
    expect(stats).toMatchObject({
      to: day(0),
      attempts: 3,
      devices: 2,
      ended: { complete: 2, stopped: 1 },
      feedback: { answered: 2, agrees: 1, agreesPercent: 50 },
      topMisjudged: [{ expectedMidi: 64, name: 'E4', count: 1 }],
      latencyByDeviceClass: { ios: { attempts: 3, medianOutputLatencyMs: 45.2, medianOffsetMs: 10 } },
      octaveErrorRate: 0.5,
      twelfthErrorRate: 0,
      truncated: false,
    });
    const histogram = stats.scoreHistogram as Array<{ from: number; count: number }>;
    expect(histogram.find((b) => b.from === 40)?.count).toBe(1);
    expect(histogram.find((b) => b.from === 70)?.count).toBe(1);
    expect(histogram.find((b) => b.from === 90)?.count).toBe(1);
  });

  it('exports JSON for the range and nothing outside it', async () => {
    const inRange = await get(`/spike-nuty/export?from=${day(-1)}&to=${day(0)}`);
    expect(inRange.status).toBe(200);
    const body = (await inRange.json()) as { attempts: Array<{ id: string; receivedAt: string; feedback?: unknown }> };
    expect(body.attempts.map((a) => a.id).sort()).toEqual([...attempts].sort());
    expect(Number.isNaN(Date.parse(body.attempts[0].receivedAt))).toBe(false);

    const before = await get('/spike-nuty/export?from=2020-01-01&to=2020-01-31');
    expect(((await before.json()) as { attempts: unknown[] }).attempts).toEqual([]);
  });

  it('exports CSV for the range through the /api-prefixed path', async () => {
    const response = await fetch(`${API}/api/spike-nuty/export?from=${day(0)}&to=${day(0)}&format=csv`, {
      headers: { 'X-Admin-Key': KEY },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const lines = (await response.text()).trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + attempts.length);
    expect(lines[0].startsWith('id,receivedAt,deviceId,')).toBe(true);
    expect(lines.slice(1).map((l) => l.split(',')[0]).sort()).toEqual([...attempts].sort());

    const empty = await get(`/spike-nuty/export?from=2020-01-01&to=2020-01-31&format=csv`);
    expect((await empty.text()).trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('answers 401 to a wrong key and 400 to a bad range', async () => {
    const wrong = await get('/spike-nuty/stats', 'wrong-key');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
    expect((await get('/spike-nuty/export', 'wrong-key')).status).toBe(401);
    expect((await get('/spike-nuty/stats?from=2026-13-01')).status).toBe(400);
  });
});

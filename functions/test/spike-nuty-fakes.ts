import { estimateRecognition, type EstimateInput } from '../src/spike-nuty/recognition-estimate.js';
import { expireAtFor, retryAfterSec, type SpikeNutyRepository } from '../src/spike-nuty/repository.js';
import type { AttemptDoc } from '../src/spike-nuty/stats.js';

export interface FakeRateWindow {
  windowStart: Date;
  count: number;
}

/**
 * In-memory `SpikeNutyRepository`. `attempts` holds what would be stored per
 * attempt id; `windows` the rate-limit counter per device.
 */
export function createMemorySpikeNutyRepository() {
  const attempts = new Map<string, Record<string, unknown>>();
  const windows = new Map<string, FakeRateWindow>();
  const calls = {
    createIfAbsent: 0,
    hitRateLimit: 0,
    listAttempts: [] as Array<{ from: Date; to: Date; limit: number }>,
  };

  const repo: SpikeNutyRepository = {
    async exists(id) {
      return attempts.has(id);
    },
    async createIfAbsent(id, record, now) {
      calls.createIfAbsent += 1;
      if (attempts.has(id)) {
        return 'exists';
      }
      attempts.set(id, { ...structuredClone(record), receivedAt: now, expireAt: expireAtFor(now) });
      return 'created';
    },
    async hitRateLimit(deviceId, now, limit, windowMs) {
      calls.hitRateLimit += 1;
      const window = windows.get(deviceId);
      if (!window || now.getTime() >= window.windowStart.getTime() + windowMs) {
        windows.set(deviceId, { windowStart: now, count: 1 });
        return { allowed: true, retryAfterSec: 0 };
      }
      if (window.count >= limit) {
        return { allowed: false, retryAfterSec: retryAfterSec(window.windowStart, windowMs, now) };
      }
      window.count += 1;
      return { allowed: true, retryAfterSec: 0 };
    },
    async listAttempts(from, to, limit) {
      calls.listAttempts.push({ from, to, limit });
      return [...attempts.entries()]
        .map(([id, data]) => ({ ...data, id }) as unknown as AttemptDoc)
        .filter((doc) => doc.receivedAt >= from && doc.receivedAt < to)
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
        .slice(0, limit);
    },
  };

  return { repo, attempts, windows, calls };
}

export const DEVICE_ID = '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b';
export const OTHER_DEVICE_ID = '7a1c2e3f-4b5d-4e6f-9a0b-1c2d3e4f5a6b';
export const ATTEMPT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab';

/** A valid v1 attempt body (record contract). */
export function sampleAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    deviceId: DEVICE_ID,
    clientTs: 1_794_000_000_000,
    app: { build: 'abc1234' },
    device: { userAgent: 'Mozilla/5.0 (iPhone)', standalone: true, platform: 'iOS', mobile: true },
    settings: {
      melodyId: 'wlazl-kotek',
      instrument: 'clarinet-bb',
      bpm: 80,
      prepSec: 4,
      ignoreOctave: false,
      visualOnly: false,
      autoLatency: true,
    },
    result: {
      scorePercent: 75,
      pitchPercent: 90,
      counts: { total: 4, good: 2, late: 1, early: 0, rhythm: 0, wrongPitch: 1, missing: 0, extra: 0 },
    },
    notes: [
      {
        nr: 1,
        refIndex: 0,
        playedIndex: 0,
        expectedMidi: 67,
        playedMidi: 67,
        centsDiff: -4.5,
        offsetMs: 12,
        status: 'good',
        octaveOff: false,
        twelfthOff: false,
      },
      {
        nr: 2,
        refIndex: 1,
        playedIndex: 1,
        expectedMidi: 64,
        playedMidi: 76,
        centsDiff: 3,
        offsetMs: -20,
        status: 'wrongPitch',
        octaveOff: true,
        twelfthOff: false,
      },
      {
        nr: 3,
        refIndex: 2,
        playedIndex: null,
        expectedMidi: 64,
        playedMidi: null,
        centsDiff: null,
        offsetMs: null,
        status: 'missing',
        octaveOff: false,
        twelfthOff: false,
      },
    ],
    events: [
      {
        midi: 69,
        startMs: 1200.5,
        durationMs: 480,
        meanCents: -4.5,
        meanClarity: 0.93,
        meanLevelDb: -21,
        frames: 40,
        suspectOctave: 0,
        suspectTwelfth: 0,
      },
    ],
    timing: {
      outputLatencyMs: 45.2,
      medianOffsetMs: 10,
      meanOffsetMs: 8.5,
      correctionMs: -10,
      samples: 2,
    },
    ended: 'complete',
    ...overrides,
  };
}

/**
 * A valid v1 attempt body with every optional field: note `windowLevelDb`,
 * event `pitchSpreadCents`, `signal` and the `estimate` the heuristic
 * computes from it.
 */
export function sampleFullAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = sampleAttempt();
  const notes = (base.notes as Record<string, unknown>[]).map((note, i) => ({
    ...note,
    windowLevelDb: i === 2 ? -18.5 : null,
  }));
  const events = (base.events as Record<string, unknown>[]).map((event) => ({ ...event, pitchSpreadCents: 14.5 }));
  const signal = { frames: 500, voicedFrames: 410, medianClarity: 0.91 };
  const body = { ...base, notes, events, signal };
  return { ...body, estimate: estimateRecognition(body as unknown as EstimateInput), ...overrides };
}

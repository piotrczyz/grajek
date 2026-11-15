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

/** A valid v1 feedback body. */
export function sampleFeedback(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    deviceId: DEVICE_ID,
    agrees: false,
    misjudged: [
      { refIndex: 1, playedIndex: 1 },
      { refIndex: null, playedIndex: 3 },
    ],
    comment: '  grałam dobrze  ',
    regraded: false,
    ...overrides,
  };
}

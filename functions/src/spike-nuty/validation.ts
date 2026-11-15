import { parseDeviceId } from '../devices/validation.js';
import type {
  AttemptCounts,
  AttemptDevice,
  AttemptEnd,
  AttemptEvent,
  AttemptFeedback,
  AttemptNote,
  AttemptRecord,
  AttemptResult,
  AttemptSettings,
  AttemptTiming,
  Instrument,
  MisjudgedNote,
  NoteStatus,
} from './types.js';

export const MAX_EVENTS = 200;
export const MAX_NOTES = 400;
export const MAX_MISJUDGED = 400;
export const MAX_ATTEMPT_BYTES = 65536;
export const MAX_FEEDBACK_BYTES = 8192;
export const MAX_COMMENT = 500;
export const MAX_USER_AGENT = 512;
export const MAX_SHORT_STRING = 64;
export const MAX_COUNT = 500;
/** Upper bound for note and event indexes; far above any real melody. */
const MAX_INDEX = 100_000;

const INSTRUMENTS = new Set<Instrument>(['clarinet-bb', 'c']);
const STATUSES = new Set<NoteStatus>(['good', 'late', 'early', 'rhythm', 'wrongPitch', 'missing', 'extra']);
const ENDS = new Set<AttemptEnd>(['complete', 'stopped']);
const COUNT_KEYS = ['total', 'good', 'late', 'early', 'rhythm', 'wrongPitch', 'missing', 'extra'] as const;

/** Thrown inside the parsers; turned into `null` at the public boundary. */
class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obj(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : fail();
}

function num(value: unknown, min = -Infinity, max = Infinity): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail();
}

function int(value: unknown, min: number, max: number): number {
  return Number.isInteger(value) ? num(value, min, max) : fail();
}

function numOrNull(value: unknown): number | null {
  return value === null ? null : num(value);
}

function intOrNull(value: unknown, min: number, max: number): number | null {
  return value === null ? null : int(value, min, max);
}

function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : fail();
}

function str(value: unknown, maxLength: number): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fail();
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>): T {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fail();
}

function list<T>(value: unknown, maxLength: number, item: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    fail();
  }
  return value.map(item);
}

function uuid(value: unknown): string {
  return parseDeviceId(value) ?? fail();
}

function parseDevice(value: unknown): AttemptDevice {
  const d = obj(value);
  const device: AttemptDevice = {
    userAgent: str(d.userAgent, MAX_USER_AGENT),
    standalone: bool(d.standalone),
  };
  if (d.platform !== undefined) {
    device.platform = str(d.platform, MAX_SHORT_STRING);
  }
  if (d.mobile !== undefined) {
    device.mobile = bool(d.mobile);
  }
  return device;
}

function parseSettings(value: unknown): AttemptSettings {
  const s = obj(value);
  return {
    melodyId: str(s.melodyId, MAX_SHORT_STRING),
    instrument: oneOf(s.instrument, INSTRUMENTS),
    bpm: int(s.bpm, 20, 300),
    prepSec: int(s.prepSec, 0, 60),
    ignoreOctave: bool(s.ignoreOctave),
    visualOnly: bool(s.visualOnly),
    autoLatency: bool(s.autoLatency),
  };
}

function parseCounts(value: unknown): AttemptCounts {
  const c = obj(value);
  const counts = {} as AttemptCounts;
  for (const key of COUNT_KEYS) {
    counts[key] = int(c[key], 0, MAX_COUNT);
  }
  return counts;
}

function parseResult(value: unknown): AttemptResult {
  const r = obj(value);
  return {
    scorePercent: int(r.scorePercent, 0, 100),
    pitchPercent: int(r.pitchPercent, 0, 100),
    counts: parseCounts(r.counts),
  };
}

function parseNote(value: unknown): AttemptNote {
  const n = obj(value);
  return {
    nr: int(n.nr, 0, MAX_INDEX),
    refIndex: intOrNull(n.refIndex, 0, MAX_INDEX),
    playedIndex: intOrNull(n.playedIndex, 0, MAX_INDEX),
    expectedMidi: intOrNull(n.expectedMidi, 0, 127),
    playedMidi: intOrNull(n.playedMidi, 0, 127),
    centsDiff: numOrNull(n.centsDiff),
    offsetMs: numOrNull(n.offsetMs),
    status: oneOf(n.status, STATUSES),
    octaveOff: bool(n.octaveOff),
    twelfthOff: bool(n.twelfthOff),
  };
}

function parseEvent(value: unknown): AttemptEvent {
  const e = obj(value);
  return {
    midi: int(e.midi, 0, 127),
    startMs: num(e.startMs),
    durationMs: num(e.durationMs, 0),
    meanCents: num(e.meanCents),
    meanClarity: num(e.meanClarity, 0, 1),
    meanLevelDb: num(e.meanLevelDb),
    frames: int(e.frames, 0, Number.MAX_SAFE_INTEGER),
    suspectOctave: int(e.suspectOctave, 0, Number.MAX_SAFE_INTEGER),
    suspectTwelfth: int(e.suspectTwelfth, 0, Number.MAX_SAFE_INTEGER),
  };
}

function parseTiming(value: unknown): AttemptTiming {
  const t = obj(value);
  return {
    outputLatencyMs: numOrNull(t.outputLatencyMs),
    medianOffsetMs: numOrNull(t.medianOffsetMs),
    meanOffsetMs: numOrNull(t.meanOffsetMs),
    correctionMs: num(t.correctionMs),
    samples: int(t.samples, 0, Number.MAX_SAFE_INTEGER),
  };
}

function parseMisjudged(value: unknown): MisjudgedNote {
  const m = obj(value);
  return {
    refIndex: intOrNull(m.refIndex, 0, MAX_INDEX),
    playedIndex: intOrNull(m.playedIndex, 0, MAX_INDEX),
  };
}

function guard<T>(parse: () => T): T | null {
  try {
    return parse();
  } catch (err) {
    if (err instanceof Invalid) {
      return null;
    }
    throw err;
  }
}

/**
 * Parses an attempt body per record contract v1. Returns a copy holding only
 * the whitelisted fields, or `null` on any violation.
 */
export function parseAttempt(body: unknown): AttemptRecord | null {
  return guard(() => {
    const b = obj(body);
    if (b.v !== 1) {
      fail();
    }
    const app = obj(b.app);
    return {
      v: 1,
      deviceId: uuid(b.deviceId),
      clientTs: num(b.clientTs, 0),
      app: { build: str(app.build, MAX_SHORT_STRING) },
      device: parseDevice(b.device),
      settings: parseSettings(b.settings),
      result: parseResult(b.result),
      notes: list(b.notes, MAX_NOTES, parseNote),
      events: list(b.events, MAX_EVENTS, parseEvent),
      timing: parseTiming(b.timing),
      ended: oneOf(b.ended, ENDS),
    };
  });
}

/**
 * Parses a feedback body. `misjudged` must be empty when `agrees` is true;
 * `comment` is trimmed and dropped when empty.
 */
export function parseFeedback(body: unknown): AttemptFeedback | null {
  return guard(() => {
    const b = obj(body);
    if (b.v !== 1) {
      fail();
    }
    const agrees = bool(b.agrees);
    const misjudged = list(b.misjudged, MAX_MISJUDGED, parseMisjudged);
    if (agrees && misjudged.length > 0) {
      fail();
    }
    const feedback: AttemptFeedback = {
      v: 1,
      deviceId: uuid(b.deviceId),
      agrees,
      misjudged,
      regraded: bool(b.regraded),
    };
    if (b.comment !== undefined) {
      const comment = str(b.comment, MAX_COMMENT).trim();
      if (comment) {
        feedback.comment = comment;
      }
    }
    return feedback;
  });
}

/** Attempt ids are client-generated lower-case UUID v4, like device ids. */
export function parseAttemptId(value: unknown): string | null {
  return parseDeviceId(value);
}

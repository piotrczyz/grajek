import { parseDeviceId } from '../devices/validation.js';
import {
  VERDICTS,
  type EstimateSignals,
  type ItemVerdict,
  type RecognitionEstimate,
  type Verdict,
  type VerdictCounts,
} from './recognition-estimate.js';
import type {
  AttemptCounts,
  AttemptDevice,
  AttemptEnd,
  AttemptEvent,
  AttemptNote,
  AttemptRecord,
  AttemptResult,
  AttemptSettings,
  AttemptSignal,
  AttemptTiming,
  Instrument,
  NoteStatus,
} from './types.js';

export const MAX_EVENTS = 200;
export const MAX_NOTES = 400;
export const MAX_ATTEMPT_BYTES = 262144;
export const MAX_USER_AGENT = 512;
export const MAX_SHORT_STRING = 64;
export const MAX_COUNT = 500;
/** Upper bound for note and event indexes; far above any real melody. */
const MAX_INDEX = 100_000;

const INSTRUMENTS = new Set<Instrument>(['clarinet-bb', 'c']);
const STATUSES = new Set<NoteStatus>(['good', 'late', 'early', 'rhythm', 'wrongPitch', 'missing', 'extra']);
const ENDS = new Set<AttemptEnd>(['complete', 'stopped']);
const COUNT_KEYS = ['total', 'good', 'late', 'early', 'rhythm', 'wrongPitch', 'missing', 'extra'] as const;
const VERDICT_SET = new Set<Verdict>(VERDICTS);
/** Reason codes are checked by shape, not membership: a new heuristic version may add codes. */
const REASON_CODE = /^[a-z][A-Za-z0-9]{0,31}$/;
export const MAX_REASON_KEYS = 32;
export const MAX_ITEM_REASON_CODES = 6;
export const MAX_HEURISTIC_VERSION = 32;

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

function numOrNull(value: unknown, min = -Infinity, max = Infinity): number | null {
  return value === null ? null : num(value, min, max);
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
  const note: AttemptNote = {
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
  if (n.windowLevelDb !== undefined) {
    note.windowLevelDb = numOrNull(n.windowLevelDb, -200, 20);
  }
  return note;
}

function parseEvent(value: unknown): AttemptEvent {
  const e = obj(value);
  const event: AttemptEvent = {
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
  if (e.pitchSpreadCents !== undefined) {
    event.pitchSpreadCents = num(e.pitchSpreadCents, 0, 2400);
  }
  return event;
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

function parseSignal(value: unknown): AttemptSignal {
  const s = obj(value);
  const frames = int(s.frames, 0, Number.MAX_SAFE_INTEGER);
  return {
    frames,
    voicedFrames: int(s.voicedFrames, 0, frames),
    medianClarity: numOrNull(s.medianClarity, 0, 1),
  };
}

function parseVerdictCounts(value: unknown): VerdictCounts {
  const c = obj(value);
  return {
    player: int(c.player, 0, MAX_NOTES),
    recognition: int(c.recognition, 0, MAX_NOTES),
    uncertain: int(c.uncertain, 0, MAX_NOTES),
    ok: int(c.ok, 0, MAX_NOTES),
  };
}

function reasonCode(value: unknown): string {
  return typeof value === 'string' && REASON_CODE.test(value) ? value : fail();
}

function parseReasonCounts(value: unknown): Record<string, number> {
  const r = obj(value);
  const keys = Object.keys(r);
  if (keys.length > MAX_REASON_KEYS) {
    fail();
  }
  const counts: Record<string, number> = {};
  for (const key of keys) {
    counts[reasonCode(key)] = int(r[key], 0, MAX_NOTES);
  }
  return counts;
}

function parseItemVerdict(value: unknown): ItemVerdict {
  const v = obj(value);
  return {
    verdict: oneOf(v.verdict, VERDICT_SET),
    reasons: list(v.reasons, MAX_ITEM_REASON_CODES, reasonCode),
  };
}

/** A list of exactly `length` item verdicts (aligned with the record's notes or events). */
function alignedVerdicts(value: unknown, length: number): ItemVerdict[] {
  const items = list(value, length, parseItemVerdict);
  return items.length === length ? items : fail();
}

function parseSignals(value: unknown): EstimateSignals {
  const s = obj(value);
  return {
    unvoicedRatio: numOrNull(s.unvoicedRatio, 0, 1),
    medianClarity: numOrNull(s.medianClarity, 0, 1),
    latencySpreadMs: numOrNull(s.latencySpreadMs, 0),
    eventsPerNote: numOrNull(s.eventsPerNote, 0),
    stopped: bool(s.stopped),
  };
}

function parseEstimate(value: unknown, notes: number, events: number): RecognitionEstimate {
  const e = obj(value);
  const heuristicVersion = str(e.heuristicVersion, MAX_HEURISTIC_VERSION);
  if (heuristicVersion.length === 0) {
    fail();
  }
  return {
    heuristicVersion,
    estimatedAccuracy: numOrNull(e.estimatedAccuracy, 0, 1),
    noteCounts: parseVerdictCounts(e.noteCounts),
    eventCounts: parseVerdictCounts(e.eventCounts),
    reasons: parseReasonCounts(e.reasons),
    notes: alignedVerdicts(e.notes, notes),
    events: alignedVerdicts(e.events, events),
    signals: parseSignals(e.signals),
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
 * the whitelisted fields, or `null` on any violation. The optional fields
 * (`signal`, `estimate`, note `windowLevelDb`, event `pitchSpreadCents`) stay
 * absent when the body omits them.
 */
export function parseAttempt(body: unknown): AttemptRecord | null {
  return guard(() => {
    const b = obj(body);
    if (b.v !== 1) {
      fail();
    }
    const app = obj(b.app);
    const record: AttemptRecord = {
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
    if (b.signal !== undefined) {
      record.signal = parseSignal(b.signal);
    }
    if (b.estimate !== undefined) {
      record.estimate = parseEstimate(b.estimate, record.notes.length, record.events.length);
    }
    return record;
  });
}

/** Attempt ids are client-generated lower-case UUID v4, like device ids. */
export function parseAttemptId(value: unknown): string | null {
  return parseDeviceId(value);
}

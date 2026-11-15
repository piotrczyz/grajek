// Builds the anonymous v1 attempt record sent to `PUT /api/spike-nuty/attempts/{id}`.
// Field names and limits mirror the server contract
// (functions/src/spike-nuty/validation.ts): every number is finite and inside
// the server's bounds, so a record built here is never rejected as invalid.
// There is deliberately no name, profile or audio field anywhere in the type.
//
// The record also carries the automatic recognition estimate (owner-only; the
// child never sees it). It is computed with the server's own module, so the
// client and the stats recompute script share one heuristic.
import {
  estimateRecognition,
  type RecognitionEstimate,
  type VerdictCounts,
} from '../../../functions/src/spike-nuty/recognition-estimate.ts';
import {
  eighthMs,
  frameSignal,
  windowLevelDb,
  type FrameSignal,
  type GradedRecording,
  type Instrument,
  type NoteEvent,
  type PitchFrame,
} from '../logic/index.ts';
import { noteRows, summarize, type NoteKind } from '../results.ts';

export const MAX_EVENTS = 200;
export const MAX_NOTES = 400;
const MAX_USER_AGENT = 512;
const MAX_SHORT_STRING = 64;
const MAX_COUNT = 500;
const MAX_INDEX = 100_000;

export type AttemptEnd = 'complete' | 'stopped';

export interface AttemptNote {
  nr: number;
  refIndex: number | null;
  playedIndex: number | null;
  expectedMidi: number | null;
  playedMidi: number | null;
  centsDiff: number | null;
  offsetMs: number | null;
  status: NoteKind;
  octaveOff: boolean;
  twelfthOff: boolean;
  /** Mean input level (dBFS) during the note's window; null when no frame fell in it. */
  windowLevelDb?: number | null;
}

export interface AttemptEvent {
  midi: number;
  startMs: number;
  durationMs: number;
  meanCents: number;
  meanClarity: number;
  meanLevelDb: number;
  frames: number;
  suspectOctave: number;
  suspectTwelfth: number;
  /** Spread of the frame pitches within the event, cents (0..2400). */
  pitchSpreadCents?: number;
}

export interface AttemptSettings {
  melodyId: string;
  instrument: Instrument;
  bpm: number;
  prepSec: number;
  ignoreOctave: boolean;
  visualOnly: boolean;
  autoLatency: boolean;
}

export interface AttemptDevice {
  userAgent: string;
  standalone: boolean;
  platform?: string;
  mobile?: boolean;
}

export interface AttemptRecord {
  v: 1;
  deviceId: string;
  clientTs: number;
  app: { build: string };
  device: AttemptDevice;
  settings: AttemptSettings;
  result: {
    scorePercent: number;
    pitchPercent: number;
    counts: {
      total: number;
      good: number;
      late: number;
      early: number;
      rhythm: number;
      wrongPitch: number;
      missing: number;
      extra: number;
    };
  };
  notes: AttemptNote[];
  events: AttemptEvent[];
  timing: {
    outputLatencyMs: number | null;
    medianOffsetMs: number | null;
    meanOffsetMs: number | null;
    correctionMs: number;
    samples: number;
  };
  ended: AttemptEnd;
  /** Frame totals of the whole attempt; absent when the frames are unknown. */
  signal?: FrameSignal;
  /** Automatic recognition estimate, computed on the full recording before any cap. */
  estimate?: RecognitionEstimate;
}

/** What the browser tells about itself; injected so tests need no real navigator. */
export interface TelemetryEnv {
  userAgent: string;
  standalone: boolean;
  /** From `navigator.userAgentData` where the browser has it (Chromium). */
  platform?: string;
  mobile?: boolean;
}

export interface BuildAttemptInput {
  deviceId: string;
  /** Epoch ms of the build (sent as `clientTs`). */
  now: number;
  /** Settings of the attempt; `bpm` is replaced by the tempo the recording was made at. */
  settings: AttemptSettings;
  /**
   * Raw detected events (sounding pitch, before the latency shift), the
   * recorded tempo and, when known, the analysed pitch frames (for the
   * attempt `signal` and each note's `windowLevelDb`).
   */
  recording: { events: NoteEvent[]; bpm: number; frames?: PitchFrame[] };
  graded: GradedRecording;
  /** Output latency of the audio path, ms; null when unknown. */
  latencyMs: number | null;
  ended: AttemptEnd;
  env: TelemetryEnv;
  /** Build id; defaults to the one defined at build time. */
  build?: string;
}

const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, finite(n, min)));
const clampInt = (n: number, min: number, max: number) => Math.round(clamp(n, min, max));
const nullableNum = (n: number | null) => (n === null || !Number.isFinite(n) ? null : n);
const nullableInt = (n: number | null, min: number, max: number) =>
  n === null || !Number.isFinite(n) ? null : clampInt(n, min, max);
/** One decimal is plenty for cents and milliseconds and keeps the record small. */
const round1 = (n: number) => Math.round(n * 10) / 10;
const nonNegativeInt = (n: number) => clampInt(n, 0, Number.MAX_SAFE_INTEGER);
const MAX_SPREAD_CENTS = 2400;
const MIN_LEVEL_DB = -200;
const MAX_LEVEL_DB = 20;

function toEvent(e: NoteEvent): AttemptEvent {
  return {
    midi: clampInt(e.midi, 0, 127),
    startMs: round1(finite(e.startMs)),
    durationMs: round1(Math.max(0, finite(e.durationMs))),
    meanCents: round1(finite(e.meanCents)),
    meanClarity: clamp(e.meanClarity, 0, 1),
    meanLevelDb: round1(finite(e.meanLevelDb)),
    frames: nonNegativeInt(e.frames),
    suspectOctave: nonNegativeInt(e.suspectOctave),
    suspectTwelfth: nonNegativeInt(e.suspectTwelfth),
    ...(e.pitchSpreadCents === undefined
      ? {}
      : { pitchSpreadCents: clampInt(e.pitchSpreadCents, 0, MAX_SPREAD_CENTS) }),
  };
}

/** Verdict counts are bounded by the server like note counts. */
function capCounts(c: VerdictCounts): VerdictCounts {
  return {
    player: clampInt(c.player, 0, MAX_NOTES),
    recognition: clampInt(c.recognition, 0, MAX_NOTES),
    uncertain: clampInt(c.uncertain, 0, MAX_NOTES),
    ok: clampInt(c.ok, 0, MAX_NOTES),
  };
}

/**
 * The estimate of the full recording, with its per-item lists cut to the
 * notes and events the record keeps (the server checks they are aligned).
 */
function capEstimate(estimate: RecognitionEstimate, notes: number, events: number): RecognitionEstimate {
  const reasons: Record<string, number> = {};
  for (const [code, n] of Object.entries(estimate.reasons)) reasons[code] = clampInt(n, 0, MAX_NOTES);
  return {
    ...estimate,
    noteCounts: capCounts(estimate.noteCounts),
    eventCounts: capCounts(estimate.eventCounts),
    reasons,
    notes: estimate.notes.slice(0, notes),
    events: estimate.events.slice(0, events),
  };
}

/** The note-by-note list, events, signal and estimate of a whole attempt, before any cap. */
export interface AttemptDetails {
  notes: AttemptNote[];
  events: AttemptEvent[];
  signal?: FrameSignal;
  estimate: RecognitionEstimate;
}

/**
 * The details of the full recording; the estimate is computed here, before
 * the record caps its lists (a capped list would shift the note-to-event link).
 * Also shown in the diagnostics panel.
 */
export function attemptDetails(input: Pick<BuildAttemptInput, 'graded' | 'recording' | 'ended'>): AttemptDetails {
  const { graded, recording } = input;
  const { frames } = recording;
  const eighth = eighthMs(recording.bpm);
  const correction = finite(graded.correctionMs);
  /** The raw-time window (before the latency shift) a row's note should sound in. */
  const windowOf = (row: { refIndex: number | null; playedIndex: number | null }): [number, number] | null => {
    if (row.refIndex !== null) {
      const ref = graded.result.reference[row.refIndex]?.note;
      if (!ref) return null;
      return [ref.startEighth * eighth + correction, (ref.startEighth + ref.durationEighths) * eighth + correction];
    }
    const played = row.playedIndex === null ? undefined : graded.result.played[row.playedIndex]?.note;
    return played ? [played.startMs + correction, played.startMs + correction + played.durationMs] : null;
  };
  const allNotes: AttemptNote[] = noteRows(graded.result, recording.bpm).map((row) => {
    const gap =
      row.expectedMidi === null || row.playedMidi === null ? null : Math.abs(row.playedMidi - row.expectedMidi);
    const note: AttemptNote = {
      nr: clampInt(row.nr, 0, MAX_INDEX),
      refIndex: nullableInt(row.refIndex, 0, MAX_INDEX),
      playedIndex: nullableInt(row.playedIndex, 0, MAX_INDEX),
      expectedMidi: nullableInt(row.expectedMidi, 0, 127),
      playedMidi: nullableInt(row.playedMidi, 0, 127),
      centsDiff: row.centsDiff === null ? null : nullableNum(round1(row.centsDiff)),
      offsetMs: row.offsetMs === null ? null : nullableNum(round1(row.offsetMs)),
      status: row.kind,
      octaveOff: gap === 12 || gap === 24,
      twelfthOff: gap === 19,
    };
    if (frames) {
      const window = windowOf(row);
      const level = window ? windowLevelDb(frames, window[0], window[1]) : null;
      note.windowLevelDb = level === null ? null : clamp(level, MIN_LEVEL_DB, MAX_LEVEL_DB);
    }
    return note;
  });
  const allEvents = recording.events.map(toEvent);
  const signal = frames ? frameSignal(frames) : undefined;
  const estimate = estimateRecognition({ notes: allNotes, events: allEvents, signal, ended: input.ended });
  return { notes: allNotes, events: allEvents, ...(signal ? { signal } : {}), estimate };
}

/** Builds the v1 attempt record from the grading shown on the result view. */
export function buildAttemptRecord(input: BuildAttemptInput): AttemptRecord {
  const { graded, recording, settings, env } = input;
  const counts = summarize(graded.result);
  const details = attemptDetails(input);
  const notes = details.notes.slice(0, MAX_NOTES);
  const events = details.events.slice(0, MAX_EVENTS);

  const device: AttemptDevice = {
    userAgent: env.userAgent.slice(0, MAX_USER_AGENT),
    standalone: env.standalone,
  };
  if (env.platform !== undefined) device.platform = env.platform.slice(0, MAX_SHORT_STRING);
  if (env.mobile !== undefined) device.mobile = env.mobile;

  const count = (n: number) => clampInt(n, 0, MAX_COUNT);
  return {
    v: 1,
    deviceId: input.deviceId,
    clientTs: Math.max(0, finite(input.now)),
    app: { build: (input.build ?? __APP_BUILD__).slice(0, MAX_SHORT_STRING) },
    device,
    settings: {
      melodyId: settings.melodyId.slice(0, MAX_SHORT_STRING),
      instrument: settings.instrument,
      bpm: clampInt(recording.bpm, 20, 300),
      prepSec: clampInt(settings.prepSec, 0, 60),
      ignoreOctave: settings.ignoreOctave,
      visualOnly: settings.visualOnly,
      autoLatency: settings.autoLatency,
    },
    result: {
      scorePercent: clampInt(graded.result.scorePercent, 0, 100),
      pitchPercent: clampInt(graded.result.pitchPercent, 0, 100),
      counts: {
        total: count(counts.total),
        good: count(counts.good),
        late: count(counts.late),
        early: count(counts.early),
        rhythm: count(counts.rhythm),
        wrongPitch: count(counts.wrongPitch),
        missing: count(counts.missing),
        extra: count(counts.extra),
      },
    },
    notes,
    events,
    timing: {
      outputLatencyMs: input.latencyMs === null ? null : nullableNum(round1(input.latencyMs)),
      medianOffsetMs: graded.medianMs === null ? null : nullableNum(round1(graded.medianMs)),
      meanOffsetMs: graded.meanMs === null ? null : nullableNum(round1(graded.meanMs)),
      correctionMs: round1(finite(graded.correctionMs)),
      samples: nonNegativeInt(graded.samples),
    },
    ended: input.ended,
    ...(details.signal ? { signal: details.signal } : {}),
    estimate: capEstimate(details.estimate, notes.length, events.length),
  };
}

interface UserAgentData {
  platform?: unknown;
  mobile?: unknown;
}

/** Reads the environment from the real browser; never throws. */
export function readTelemetryEnv(): TelemetryEnv {
  const nav: (Navigator & { userAgentData?: UserAgentData; standalone?: boolean }) | undefined =
    typeof navigator === 'undefined' ? undefined : navigator;
  let standalone = nav?.standalone === true;
  try {
    if (!standalone && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      standalone = window.matchMedia('(display-mode: standalone)').matches;
    }
  } catch {
    // matchMedia unavailable: keep what navigator.standalone said.
  }
  const env: TelemetryEnv = { userAgent: nav?.userAgent ?? '', standalone };
  const data = nav?.userAgentData;
  if (data && typeof data.platform === 'string') env.platform = data.platform;
  if (data && typeof data.mobile === 'boolean') env.mobile = data.mobile;
  return env;
}

// Builds the anonymous v1 attempt record sent to `PUT /api/spike-nuty/attempts/{id}`.
// Field names and limits mirror the server contract
// (functions/src/spike-nuty/validation.ts): every number is finite and inside
// the server's bounds, so a record built here is never rejected as invalid.
// There is deliberately no name, profile or audio field anywhere in the type.
import type { GradedRecording, Instrument, NoteEvent } from '../logic/index.ts';
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
  /** Raw detected events (sounding pitch, before the latency shift) and the recorded tempo. */
  recording: { events: NoteEvent[]; bpm: number };
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
  };
}

/** Builds the v1 attempt record from the grading shown on the result view. */
export function buildAttemptRecord(input: BuildAttemptInput): AttemptRecord {
  const { graded, recording, settings, env } = input;
  const counts = summarize(graded.result);
  const notes: AttemptNote[] = noteRows(graded.result, recording.bpm)
    .slice(0, MAX_NOTES)
    .map((row) => {
      const gap =
        row.expectedMidi === null || row.playedMidi === null ? null : Math.abs(row.playedMidi - row.expectedMidi);
      return {
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
    });

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
    events: recording.events.slice(0, MAX_EVENTS).map(toEvent),
    timing: {
      outputLatencyMs: input.latencyMs === null ? null : nullableNum(round1(input.latencyMs)),
      medianOffsetMs: graded.medianMs === null ? null : nullableNum(round1(graded.medianMs)),
      meanOffsetMs: graded.meanMs === null ? null : nullableNum(round1(graded.meanMs)),
      correctionMs: round1(finite(graded.correctionMs)),
      samples: nonNegativeInt(graded.samples),
    },
    ended: input.ended,
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

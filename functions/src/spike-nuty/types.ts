/**
 * Record contract v1 of the "Zagraj i sprawdź" spike telemetry
 * (`PUT /api/spike-nuty/attempts/{attemptId}` and `.../feedback`).
 * Field names and limits are shared with the client record builder.
 */

export type Instrument = 'clarinet-bb' | 'c';

export type NoteStatus = 'good' | 'late' | 'early' | 'rhythm' | 'wrongPitch' | 'missing' | 'extra';

export type AttemptEnd = 'complete' | 'stopped';

export interface AttemptSettings {
  melodyId: string;
  instrument: Instrument;
  bpm: number;
  prepSec: number;
  ignoreOctave: boolean;
  visualOnly: boolean;
  autoLatency: boolean;
}

export interface AttemptCounts {
  total: number;
  good: number;
  late: number;
  early: number;
  rhythm: number;
  wrongPitch: number;
  missing: number;
  extra: number;
}

export interface AttemptResult {
  scorePercent: number;
  pitchPercent: number;
  counts: AttemptCounts;
}

export interface AttemptNote {
  nr: number;
  refIndex: number | null;
  playedIndex: number | null;
  expectedMidi: number | null;
  playedMidi: number | null;
  centsDiff: number | null;
  offsetMs: number | null;
  status: NoteStatus;
  octaveOff: boolean;
  twelfthOff: boolean;
}

/** One raw detected event (sounding pitch, before the latency shift). */
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

export interface AttemptTiming {
  outputLatencyMs: number | null;
  medianOffsetMs: number | null;
  meanOffsetMs: number | null;
  correctionMs: number;
  samples: number;
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
  result: AttemptResult;
  notes: AttemptNote[];
  events: AttemptEvent[];
  timing: AttemptTiming;
  ended: AttemptEnd;
}

export interface MisjudgedNote {
  refIndex: number | null;
  playedIndex: number | null;
}

export interface AttemptFeedback {
  v: 1;
  deviceId: string;
  agrees: boolean;
  misjudged: MisjudgedNote[];
  comment?: string;
  regraded: boolean;
}

/** What `spikeNutyAttempts/{attemptId}` holds. */
export interface StoredAttempt extends AttemptRecord {
  receivedAt: Date;
  expireAt: Date;
  feedback?: Omit<AttemptFeedback, 'v' | 'deviceId'>;
  feedbackAt?: Date;
}

export type CreateResult = 'created' | 'exists';

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSec: number;
}

/**
 * Owner statistics over stored spike attempts (`GET /api/spike-nuty/stats`).
 * Pure: computed at read time from the documents of one date range, so the
 * stored schema carries no derived fields.
 *
 * Recognition accuracy comes from the automatic estimate
 * (`recognition-estimate.ts`): the estimate stored with the attempt when it
 * was computed by the current `HEURISTIC_VERSION`, otherwise one recomputed
 * here from the raw record (`resolveEstimate`).
 */
import {
  estimateRecognition,
  HEURISTIC_VERSION,
  REASON_CODES,
  type RecognitionEstimate,
  type VerdictCounts,
} from './recognition-estimate.js';
import type { StoredAttempt } from './types.js';

/** One stored attempt with its document id, as the repository lists it. */
export interface AttemptDoc extends StoredAttempt {
  id: string;
}

export type DeviceClass = 'ios' | 'android' | 'desktop' | 'other';

export interface ScoreBucket {
  from: number;
  to: number;
  count: number;
}

export interface LatencyStats {
  attempts: number;
  medianOutputLatencyMs: number | null;
  medianOffsetMs: number | null;
}

/** `stored`: the attempt's own estimate; `recomputed`: computed here from the raw record. */
export type EstimateSource = 'stored' | 'recomputed';

export interface ResolvedEstimate {
  estimate: RecognitionEstimate;
  source: EstimateSource;
}

/** Estimated accuracy bucket over 0..1; the last bucket includes 1. */
export interface AccuracyBucket {
  from: number;
  to: number;
  count: number;
}

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface AccuracyGroup {
  attempts: number;
  /** Mean estimated accuracy of the attempts that have one; `null` without any. */
  meanAccuracy: number | null;
}

export interface ExpectedNoteStats extends VerdictCounts {
  /** `null` for notes the player did not have to play (extra notes). */
  expectedMidi: number | null;
  name: string;
  notes: number;
}

export interface DailyStats extends AccuracyGroup {
  /** UTC day of `receivedAt`, `YYYY-MM-DD`. */
  day: string;
}

export interface AttemptSignalStats {
  medianUnvoicedRatio: number | null;
  medianClarity: number | null;
  medianLatencySpreadMs: number | null;
  medianEventsPerNote: number | null;
  /** Share of the attempts ended with Stop; `null` without attempts. */
  stoppedShare: number | null;
}

export interface EstimateStats {
  heuristicVersion: string;
  accuracyHistogram: AccuracyBucket[];
  /** Attempts without an estimated accuracy (no reference notes). */
  noAccuracy: number;
  meanAccuracy: number | null;
  medianAccuracy: number | null;
  /** Reason codes of the notes judged `recognition`, most frequent first. */
  topRecognitionReasons: ReasonCount[];
  byMelody: Record<string, AccuracyGroup>;
  byExpectedNote: ExpectedNoteStats[];
  byDeviceClass: Partial<Record<DeviceClass, AccuracyGroup>>;
  daily: DailyStats[];
  signals: AttemptSignalStats;
}

export interface RepeatStats {
  /** Consecutive attempts of one device and melody within `REPEAT_WINDOW_MS`. */
  pairs: number;
  /** Of those, pairs whose scores differ by at least `REPEAT_SCORE_DIFF` points. */
  divergent: number;
  /** Median absolute difference of estimated accuracy in the divergent pairs; `null` without any. */
  medianAccuracyDiff: number | null;
}

export interface SpikeNutyStats {
  attempts: number;
  devices: number;
  ended: { complete: number; stopped: number };
  scoreHistogram: ScoreBucket[];
  latencyByDeviceClass: Partial<Record<DeviceClass, LatencyStats>>;
  /** Notes flagged `octaveOff` / notes with a played pitch; `null` without any. */
  octaveErrorRate: number | null;
  twelfthErrorRate: number | null;
  estimateSource: Record<EstimateSource, number>;
  estimate: EstimateStats;
  repeats: RepeatStats;
  truncated: boolean;
}

/** Two attempts of one device and melody at most this far apart count as a repeat. */
export const REPEAT_WINDOW_MS = 5 * 60 * 1000;
/** A repeat whose score differs by at least this many points is divergent. */
export const REPEAT_SCORE_DIFF = 30;
/** At most this many reason codes in `topRecognitionReasons`. */
export const TOP_REASONS = 10;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Scientific pitch name of a MIDI number (60 → `C4`); `extra` for no expected note. */
export function midiName(midi: number | null): string {
  if (midi === null) {
    return 'extra';
  }
  const pitchClass = ((midi % 12) + 12) % 12;
  return `${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}`;
}

/** Device class from the user agent the client sent. */
export function deviceClass(userAgent: string): DeviceClass {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'ios';
  }
  if (/Android/i.test(userAgent)) {
    return 'android';
  }
  if (/Windows|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(userAgent)) {
    return 'desktop';
  }
  return 'other';
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rate(flagged: number, total: number): number | null {
  return total === 0 ? null : Math.round((flagged / total) * 10_000) / 10_000;
}

function round3(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : round3(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function emptyHistogram(): ScoreBucket[] {
  return Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }));
}

function emptyAccuracyHistogram(): AccuracyBucket[] {
  return Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, count: 0 }));
}

/**
 * The estimate an attempt is counted with: its stored estimate when that was
 * computed by the current `HEURISTIC_VERSION` and is aligned with the
 * record's notes and events; otherwise one recomputed from the raw record
 * (no estimate stored, an older heuristic version, or misaligned lists).
 */
export function resolveEstimate(doc: StoredAttempt): ResolvedEstimate {
  const stored = doc.estimate;
  if (
    stored &&
    stored.heuristicVersion === HEURISTIC_VERSION &&
    Array.isArray(stored.notes) &&
    Array.isArray(stored.events) &&
    stored.notes.length === doc.notes.length &&
    stored.events.length === doc.events.length
  ) {
    return { estimate: stored, source: 'stored' };
  }
  return {
    estimate: estimateRecognition({ notes: doc.notes, events: doc.events, signal: doc.signal, ended: doc.ended }),
    source: 'recomputed',
  };
}

interface GroupAccumulator {
  attempts: number;
  accuracies: number[];
}

function addToGroup<K>(groups: Map<K, GroupAccumulator>, key: K, accuracy: number | null): void {
  const group = groups.get(key) ?? { attempts: 0, accuracies: [] };
  group.attempts += 1;
  if (accuracy !== null) {
    group.accuracies.push(accuracy);
  }
  groups.set(key, group);
}

function toGroup(group: GroupAccumulator): AccuracyGroup {
  return { attempts: group.attempts, meanAccuracy: mean(group.accuracies) };
}

interface RepeatEntry {
  at: number;
  score: number;
  accuracy: number | null;
}

/** Consecutive attempts of one device and melody within the window; divergent by score. */
function countRepeats(entries: Map<string, RepeatEntry[]>): RepeatStats {
  let pairs = 0;
  let divergent = 0;
  const diffs: number[] = [];
  for (const list of entries.values()) {
    const sorted = [...list].sort((a, b) => a.at - b.at);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (next.at - prev.at > REPEAT_WINDOW_MS) {
        continue;
      }
      pairs += 1;
      if (Math.abs(next.score - prev.score) >= REPEAT_SCORE_DIFF) {
        divergent += 1;
        if (prev.accuracy !== null && next.accuracy !== null) {
          diffs.push(Math.abs(next.accuracy - prev.accuracy));
        }
      }
    }
  }
  return { pairs, divergent, medianAccuracyDiff: round3(median(diffs)) };
}

export function computeStats(docs: AttemptDoc[], truncated = false): SpikeNutyStats {
  const devices = new Set<string>();
  const ended = { complete: 0, stopped: 0 };
  const scoreHistogram = emptyHistogram();
  const latency = new Map<DeviceClass, { attempts: number; output: number[]; offset: number[] }>();
  let played = 0;
  let octave = 0;
  let twelfth = 0;

  const estimateSource: Record<EstimateSource, number> = { stored: 0, recomputed: 0 };
  const accuracyHistogram = emptyAccuracyHistogram();
  const accuracies: number[] = [];
  let noAccuracy = 0;
  const reasons = new Map<string, number>();
  const byMelody = new Map<string, GroupAccumulator>();
  const byDevice = new Map<DeviceClass, GroupAccumulator>();
  const byDay = new Map<string, GroupAccumulator>();
  const byNote = new Map<number | null, ExpectedNoteStats>();
  const signals = { unvoiced: [] as number[], clarity: [] as number[], spread: [] as number[], perNote: [] as number[] };
  const repeats = new Map<string, RepeatEntry[]>();

  for (const doc of docs) {
    devices.add(doc.deviceId);
    ended[doc.ended] += 1;
    scoreHistogram[Math.min(9, Math.floor(doc.result.scorePercent / 10))].count += 1;

    for (const note of doc.notes) {
      if (note.playedMidi !== null) {
        played += 1;
        octave += note.octaveOff ? 1 : 0;
        twelfth += note.twelfthOff ? 1 : 0;
      }
    }

    const cls = deviceClass(doc.device.userAgent);
    const bucket = latency.get(cls) ?? { attempts: 0, output: [], offset: [] };
    bucket.attempts += 1;
    if (doc.timing.outputLatencyMs !== null) {
      bucket.output.push(doc.timing.outputLatencyMs);
    }
    if (doc.timing.medianOffsetMs !== null) {
      bucket.offset.push(doc.timing.medianOffsetMs);
    }
    latency.set(cls, bucket);

    const { estimate, source } = resolveEstimate(doc);
    estimateSource[source] += 1;
    const accuracy = estimate.estimatedAccuracy;
    if (accuracy === null) {
      noAccuracy += 1;
    } else {
      accuracies.push(accuracy);
      accuracyHistogram[Math.min(9, Math.floor(accuracy * 10))].count += 1;
    }
    for (const [reason, count] of Object.entries(estimate.reasons)) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + count);
    }
    addToGroup(byMelody, doc.settings.melodyId, accuracy);
    addToGroup(byDevice, cls, accuracy);
    addToGroup(byDay, doc.receivedAt.toISOString().slice(0, 10), accuracy);

    doc.notes.forEach((note, i) => {
      const verdict = estimate.notes[i]?.verdict;
      if (!verdict) {
        return;
      }
      const entry = byNote.get(note.expectedMidi) ?? {
        expectedMidi: note.expectedMidi,
        name: midiName(note.expectedMidi),
        notes: 0,
        player: 0,
        recognition: 0,
        uncertain: 0,
        ok: 0,
      };
      entry.notes += 1;
      entry[verdict] += 1;
      byNote.set(note.expectedMidi, entry);
    });

    const s = estimate.signals;
    if (s.unvoicedRatio !== null) signals.unvoiced.push(s.unvoicedRatio);
    if (s.medianClarity !== null) signals.clarity.push(s.medianClarity);
    if (s.latencySpreadMs !== null) signals.spread.push(s.latencySpreadMs);
    if (s.eventsPerNote !== null) signals.perNote.push(s.eventsPerNote);

    const repeatKey = JSON.stringify([doc.deviceId, doc.settings.melodyId]);
    const list = repeats.get(repeatKey) ?? [];
    list.push({ at: doc.receivedAt.getTime(), score: doc.result.scorePercent, accuracy });
    repeats.set(repeatKey, list);
  }

  const latencyByDeviceClass: Partial<Record<DeviceClass, LatencyStats>> = {};
  for (const [cls, bucket] of latency) {
    latencyByDeviceClass[cls] = {
      attempts: bucket.attempts,
      medianOutputLatencyMs: median(bucket.output),
      medianOffsetMs: median(bucket.offset),
    };
  }

  const order = new Map<string, number>(REASON_CODES.map((code, i) => [code, i]));
  const topRecognitionReasons = [...reasons.entries()]
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ reason, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (order.get(a.reason) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.reason) ?? Number.MAX_SAFE_INTEGER) ||
        a.reason.localeCompare(b.reason),
    )
    .slice(0, TOP_REASONS);

  const byDeviceClass: Partial<Record<DeviceClass, AccuracyGroup>> = {};
  for (const [cls, group] of byDevice) {
    byDeviceClass[cls] = toGroup(group);
  }
  const byMelodyOut: Record<string, AccuracyGroup> = {};
  for (const [melodyId, group] of [...byMelody.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    byMelodyOut[melodyId] = toGroup(group);
  }

  return {
    attempts: docs.length,
    devices: devices.size,
    ended,
    scoreHistogram,
    latencyByDeviceClass,
    octaveErrorRate: rate(octave, played),
    twelfthErrorRate: rate(twelfth, played),
    estimateSource,
    estimate: {
      heuristicVersion: HEURISTIC_VERSION,
      accuracyHistogram,
      noAccuracy,
      meanAccuracy: mean(accuracies),
      medianAccuracy: round3(median(accuracies)),
      topRecognitionReasons,
      byMelody: byMelodyOut,
      byExpectedNote: [...byNote.values()].sort(
        (a, b) => (a.expectedMidi ?? Number.POSITIVE_INFINITY) - (b.expectedMidi ?? Number.POSITIVE_INFINITY),
      ),
      byDeviceClass,
      daily: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, group]) => ({ day, ...toGroup(group) })),
      signals: {
        medianUnvoicedRatio: round3(median(signals.unvoiced)),
        medianClarity: round3(median(signals.clarity)),
        medianLatencySpreadMs: median(signals.spread),
        medianEventsPerNote: round3(median(signals.perNote)),
        stoppedShare: rate(ended.stopped, docs.length),
      },
    },
    repeats: countRepeats(repeats),
    truncated,
  };
}

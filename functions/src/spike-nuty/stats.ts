/**
 * Owner statistics over stored spike attempts (`GET /api/spike-nuty/stats`).
 * Pure: computed at read time from the documents of one date range, so the
 * stored schema carries no derived fields.
 */
import type { AttemptNote, MisjudgedNote, StoredAttempt } from './types.js';

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

export interface MisjudgedCount {
  /** `null` for notes the player did not have to play (extra notes). */
  expectedMidi: number | null;
  name: string;
  count: number;
}

export interface LatencyStats {
  attempts: number;
  medianOutputLatencyMs: number | null;
  medianOffsetMs: number | null;
}

export interface SpikeNutyStats {
  attempts: number;
  devices: number;
  ended: { complete: number; stopped: number };
  scoreHistogram: ScoreBucket[];
  feedback: { answered: number; agrees: number; agreesPercent: number | null };
  topMisjudged: MisjudgedCount[];
  latencyByDeviceClass: Partial<Record<DeviceClass, LatencyStats>>;
  /** Notes flagged `octaveOff` / notes with a played pitch; `null` without any. */
  octaveErrorRate: number | null;
  twelfthErrorRate: number | null;
  truncated: boolean;
}

export const TOP_MISJUDGED = 10;

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

function emptyHistogram(): ScoreBucket[] {
  return Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }));
}

/** The attempt's note a misjudged entry points at: by `refIndex`, else by `playedIndex` of an extra note. */
function findNote(notes: AttemptNote[], entry: MisjudgedNote): AttemptNote | undefined {
  if (entry.refIndex !== null) {
    return notes.find((note) => note.refIndex === entry.refIndex);
  }
  if (entry.playedIndex !== null) {
    return notes.find((note) => note.refIndex === null && note.playedIndex === entry.playedIndex);
  }
  return undefined;
}

export function computeStats(docs: AttemptDoc[], truncated = false): SpikeNutyStats {
  const devices = new Set<string>();
  const ended = { complete: 0, stopped: 0 };
  const scoreHistogram = emptyHistogram();
  const feedback = { answered: 0, agrees: 0 };
  const misjudged = new Map<number | null, number>();
  const latency = new Map<DeviceClass, { attempts: number; output: number[]; offset: number[] }>();
  let played = 0;
  let octave = 0;
  let twelfth = 0;

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

    if (doc.feedback) {
      feedback.answered += 1;
      if (doc.feedback.agrees) {
        feedback.agrees += 1;
      }
      for (const entry of doc.feedback.misjudged) {
        const note = findNote(doc.notes, entry);
        if (note) {
          misjudged.set(note.expectedMidi, (misjudged.get(note.expectedMidi) ?? 0) + 1);
        }
      }
    }
  }

  const topMisjudged = [...misjudged.entries()]
    .map(([expectedMidi, count]) => ({ expectedMidi, name: midiName(expectedMidi), count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.expectedMidi ?? Number.POSITIVE_INFINITY) - (b.expectedMidi ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, TOP_MISJUDGED);

  const latencyByDeviceClass: Partial<Record<DeviceClass, LatencyStats>> = {};
  for (const [cls, bucket] of latency) {
    latencyByDeviceClass[cls] = {
      attempts: bucket.attempts,
      medianOutputLatencyMs: median(bucket.output),
      medianOffsetMs: median(bucket.offset),
    };
  }

  return {
    attempts: docs.length,
    devices: devices.size,
    ended,
    scoreHistogram,
    feedback: {
      ...feedback,
      agreesPercent: feedback.answered === 0 ? null : Math.round((feedback.agrees / feedback.answered) * 100),
    },
    topMisjudged,
    latencyByDeviceClass,
    octaveErrorRate: rate(octave, played),
    twelfthErrorRate: rate(twelfth, played),
    truncated,
  };
}

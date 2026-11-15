// Grading with an automatic onset correction. Input latency of the audio path
// and a child's steady lag behind the click shift every onset by about the
// same amount; with the onset tolerance at 0 eighths that alone turns a
// correct performance yellow. Pass 1 grades the raw events and measures the
// onset offset of every pitch-matched note; pass 2 shifts all events by the
// median offset (clamped) and grades again.

import { compare, type CompareResult } from './compare.ts';
import type { Melody } from './melodies.ts';
import { eighthMs, quantize } from './quantize.ts';
import type { NoteEvent } from './segment.ts';

export interface GradeOptions {
  ignoreOctave: boolean;
  /** Apply the median onset correction (pass 2). */
  autoLatency: boolean;
}

export interface GradedRecording {
  result: CompareResult;
  /** Shift subtracted from every onset, ms (0 when not applied). */
  correctionMs: number;
  /** Median and mean onset offset before correction, ms; null without samples. */
  medianMs: number | null;
  meanMs: number | null;
  /** Number of pitch-matched notes the offsets were measured on. */
  samples: number;
  /** The events as graded (shifted by the correction). */
  events: NoteEvent[];
}

/** Largest correction applied, ms: beyond it the shift is a playing error, not latency. */
export const MAX_CORRECTION_MS = 250;
/** Fewest pitch-matched notes needed before a correction is applied. */
export const MIN_CORRECTION_SAMPLES = 3;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Onset offsets (played start minus reference start, ms) of the pitch-matched notes. */
export function onsetOffsets(result: CompareResult, bpm: number): number[] {
  const eighth = eighthMs(bpm);
  const offsets: number[] = [];
  for (const r of result.reference) {
    if (r.playedIndex === null || r.grade === 'red') continue;
    offsets.push(result.played[r.playedIndex].note.startMs - r.note.startEighth * eighth);
  }
  return offsets;
}

/** Grades written-pitch events against the melody, with the optional onset correction. */
export function gradeRecording(
  melody: Melody,
  events: NoteEvent[],
  bpm: number,
  options: GradeOptions,
): GradedRecording {
  const first = compare(melody, quantize(events, bpm), { ignoreOctave: options.ignoreOctave });
  const offsets = onsetOffsets(first, bpm);
  const medianMs = median(offsets);
  const meanMs = offsets.length === 0 ? null : offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const apply = options.autoLatency && medianMs !== null && offsets.length >= MIN_CORRECTION_SAMPLES;
  const correctionMs = apply
    ? Math.max(-MAX_CORRECTION_MS, Math.min(MAX_CORRECTION_MS, medianMs))
    : 0;
  if (correctionMs === 0) {
    return { result: first, correctionMs: 0, medianMs, meanMs, samples: offsets.length, events };
  }
  const shifted = events.map((event) => ({ ...event, startMs: event.startMs - correctionMs }));
  const result = compare(melody, quantize(shifted, bpm), { ignoreOctave: options.ignoreOctave });
  return { result, correctionMs, medianMs, meanMs, samples: offsets.length, events: shifted };
}

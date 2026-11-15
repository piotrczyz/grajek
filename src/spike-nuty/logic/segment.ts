// Segmentation: a stream of pitch frames becomes a list of note events.
//
// Onsets: unvoiced -> voiced, a stable pitch change of at least one semitone
// (held for `stableMs`), or a level re-attack of the same pitch (the level
// dipped by `reattackDb` and rose again by as much). Brief dropouts shorter
// than `stableMs` do not split a note unless the tone comes back re-attacked.
// Frames inside an ignore window (metronome clicks) are skipped: they never
// start a note and never end one already sounding.

import { hzToMidiFloat } from './pitch.ts';

export interface PitchFrame {
  /** Milliseconds relative to the first downbeat after the count-in. */
  timeMs: number;
  hz: number | null;
  /** Detector confidence, 0..1. */
  clarity: number;
  levelDb: number;
}

export interface SegmentOptions {
  minClarity: number;
  minLevelDb: number;
  minNoteMs: number;
  stableMs: number;
  reattackDb: number;
  ignoreWindows: Array<[startMs: number, endMs: number]>;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = {
  minClarity: 0.9,
  minLevelDb: -50,
  minNoteMs: 80,
  stableMs: 60,
  reattackDb: 6,
  ignoreWindows: [],
};

export interface NoteEvent {
  /** Sounding MIDI note: the median of the event's frames. */
  midi: number;
  startMs: number;
  durationMs: number;
  /** Mean deviation in cents of the frames at the event's pitch. */
  meanCents: number;
  /** Number of voiced frames in the event. */
  frames: number;
  /** Frames an octave (±12) away from the event's pitch. */
  suspectOctave: number;
  /** Frames a twelfth (±19) away from the event's pitch. */
  suspectTwelfth: number;
  /** Mean detector clarity of the voiced frames, 0..1, rounded to 0.001. */
  meanClarity: number;
  /** Mean level of the voiced frames in dB, rounded to 0.1. */
  meanLevelDb: number;
  /**
   * Pitch spread within the event: the standard deviation of the frame
   * pitches in cents, rounded to 1. Large when the pitch wobbles or some
   * frames jump an octave. Optional because events built by hand (tests,
   * older code) may lack it; `segment` always sets it.
   */
  pitchSpreadCents?: number;
}

interface VoicedFrame {
  timeMs: number;
  midiFloat: number;
  midi: number;
  levelDb: number;
  clarity: number;
}

interface OpenNote {
  startMs: number;
  frames: VoicedFrame[];
  /** Highest level since the onset or since the level last rose. */
  peakDb: number;
  /** Lowest level after `peakDb`. */
  dipDb: number;
  /** A different pitch that has not lasted `stableMs` yet. */
  candidate: VoicedFrame[];
  /** Start of the current dropout, with the number of unvoiced frames in it. */
  gapStartMs: number | null;
  gapFrames: number;
}

function medianMidi(frames: VoicedFrame[]): number {
  const sorted = frames.map((f) => f.midi).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
}

function frameStepMs(frames: PitchFrame[]): number {
  if (frames.length < 2) return 20;
  const diffs: number[] = [];
  for (let i = 1; i < frames.length; i += 1) diffs.push(frames[i].timeMs - frames[i - 1].timeMs);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function toEvent(note: OpenNote, endMs: number): NoteEvent {
  const midi = medianMidi(note.frames);
  const atPitch = note.frames.filter((f) => f.midi === midi);
  const meanCents =
    atPitch.reduce((sum, f) => sum + (f.midiFloat - midi) * 100, 0) / Math.max(atPitch.length, 1);
  return {
    midi,
    startMs: note.startMs,
    durationMs: endMs - note.startMs,
    meanCents: Math.round(meanCents),
    frames: note.frames.length,
    suspectOctave: note.frames.filter((f) => Math.abs(f.midi - midi) === 12).length,
    suspectTwelfth: note.frames.filter((f) => Math.abs(f.midi - midi) === 19).length,
    meanClarity: Math.round(mean(note.frames.map((f) => f.clarity)) * 1000) / 1000,
    meanLevelDb: Math.round(mean(note.frames.map((f) => f.levelDb)) * 10) / 10,
    pitchSpreadCents: Math.round(standardDeviation(note.frames.map((f) => f.midiFloat * 100))),
  };
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** A frame the segmenter treats as voiced: a pitch, confident and loud enough. */
export function isVoicedFrame(frame: PitchFrame, options: Partial<SegmentOptions> = {}): boolean {
  const opts: SegmentOptions = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
  return (
    frame.hz !== null &&
    Number.isFinite(frame.hz) &&
    frame.hz > 0 &&
    frame.clarity >= opts.minClarity &&
    frame.levelDb >= opts.minLevelDb
  );
}

/** The frames the segmenter analyses: those outside every ignore window (metronome clicks). */
export function analysedFrames(frames: PitchFrame[], ignoreWindows: SegmentOptions['ignoreWindows']): PitchFrame[] {
  return frames.filter((frame) => !ignoreWindows.some(([start, end]) => frame.timeMs >= start && frame.timeMs <= end));
}

/** Frame totals of a whole attempt (sent as the record's `signal`). */
export interface FrameSignal {
  frames: number;
  /** Frames the segmenter treats as voiced. */
  voicedFrames: number;
  /** Median detector clarity over all frames, 0..1, rounded to 0.001; null without frames. */
  medianClarity: number | null;
}

export function frameSignal(frames: PitchFrame[], options: Partial<SegmentOptions> = {}): FrameSignal {
  const clarities = frames
    .map((f) => (Number.isFinite(f.clarity) ? Math.min(1, Math.max(0, f.clarity)) : 0))
    .sort((a, b) => a - b);
  const mid = Math.floor(clarities.length / 2);
  const medianClarity =
    clarities.length === 0
      ? null
      : clarities.length % 2 === 1
        ? clarities[mid]
        : (clarities[mid - 1] + clarities[mid]) / 2;
  return {
    frames: frames.length,
    voicedFrames: frames.filter((f) => isVoicedFrame(f, options)).length,
    medianClarity: medianClarity === null ? null : Math.round(medianClarity * 1000) / 1000,
  };
}

/** Mean input level (dB) of the frames in [startMs, endMs), rounded to 0.1; null without frames there. */
export function windowLevelDb(frames: PitchFrame[], startMs: number, endMs: number): number | null {
  const levels = frames
    .filter((f) => f.timeMs >= startMs && f.timeMs < endMs && Number.isFinite(f.levelDb))
    .map((f) => f.levelDb);
  return levels.length === 0 ? null : Math.round(mean(levels) * 10) / 10;
}

export function segment(frames: PitchFrame[], options: Partial<SegmentOptions> = {}): NoteEvent[] {
  const opts: SegmentOptions = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
  const sorted = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  const step = frameStepMs(sorted);
  const events: NoteEvent[] = [];
  let note: OpenNote | null = null;

  const inIgnoreWindow = (timeMs: number) =>
    opts.ignoreWindows.some(([start, end]) => timeMs >= start && timeMs <= end);

  const open = (first: VoicedFrame[]): OpenNote => ({
    startMs: first[0].timeMs,
    frames: [...first],
    peakDb: first[first.length - 1].levelDb,
    dipDb: first[first.length - 1].levelDb,
    candidate: [],
    gapStartMs: null,
    gapFrames: 0,
  });

  const close = (endMs: number) => {
    if (!note) return;
    note.frames.push(...note.candidate);
    const event = toEvent(note, endMs);
    if (event.durationMs >= opts.minNoteMs) events.push(event);
    note = null;
  };

  for (const frame of sorted) {
    if (inIgnoreWindow(frame.timeMs)) continue;

    const voiced = isVoicedFrame(frame, opts);

    if (!voiced) {
      if (note) {
        if (note.gapStartMs === null) note.gapStartMs = frame.timeMs;
        note.gapFrames += 1;
        note.dipDb = Math.min(note.dipDb, frame.levelDb);
        if (note.gapFrames * step >= opts.stableMs) close(note.gapStartMs);
      }
      continue;
    }

    const midiFloat = hzToMidiFloat(frame.hz as number);
    const current: VoicedFrame = {
      timeMs: frame.timeMs,
      midiFloat,
      midi: Math.round(midiFloat),
      levelDb: frame.levelDb,
      clarity: frame.clarity,
    };

    if (!note) {
      note = open([current]);
      continue;
    }

    const pitch = medianMidi(note.frames);
    const reattack =
      note.peakDb - note.dipDb >= opts.reattackDb && current.levelDb - note.dipDb >= opts.reattackDb;

    if (note.gapStartMs !== null) {
      // Coming back from a short dropout.
      const gapStart: number = note.gapStartMs;
      note.gapStartMs = null;
      note.gapFrames = 0;
      if (current.midi !== pitch || reattack) {
        close(gapStart);
        note = open([current]);
        continue;
      }
    } else if (current.midi === pitch && reattack) {
      close(current.timeMs);
      note = open([current]);
      continue;
    }

    if (current.midi === pitch) {
      // A short excursion that came back: the frames stay in the note.
      note.frames.push(...note.candidate, current);
      note.candidate = [];
    } else {
      if (note.candidate.length > 0 && note.candidate[0].midi !== current.midi) {
        note.frames.push(...note.candidate);
        note.candidate = [];
      }
      note.candidate.push(current);
      const span = current.timeMs - note.candidate[0].timeMs + step;
      if (span >= opts.stableMs) {
        const candidate = note.candidate;
        note.candidate = [];
        close(candidate[0].timeMs);
        note = open(candidate);
        continue;
      }
    }

    if (current.levelDb >= note.peakDb) {
      note.peakDb = current.levelDb;
      note.dipDb = current.levelDb;
    } else {
      note.dipDb = Math.min(note.dipDb, current.levelDb);
    }
  }

  if (note) {
    const last: OpenNote = note;
    close(last.gapStartMs ?? sorted[sorted.length - 1].timeMs + step);
  }
  return events;
}

/**
 * Automatic estimate of the recognition accuracy of one "Zagraj i sprawdź"
 * attempt, computed from the attempt record alone (owner-only diagnostics;
 * the child never sees it).
 *
 * Every note of the note-by-note list and every raw event is classified as a
 * likely player error (`player`), a likely recognition error
 * (`recognition`), `uncertain`, or `ok` (graded good, nothing suspicious).
 * The estimated accuracy is 1 − (reference notes judged `recognition`) /
 * (reference notes).
 *
 * This module has no imports and uses ES2022 syntax only: the Vite client
 * computes the estimate with it and the functions read and recompute it with
 * the same code. Bump `HEURISTIC_VERSION` whenever a rule or threshold
 * changes, so stored estimates can be recomputed from the raw record.
 *
 * Linking notes to events: `playedIndex` indexes the graded played notes,
 * which are the record's events without the leading count-in events the
 * quantizer drops. So the event of a note is
 * `events[playedIndex + events.length − (notes with a playedIndex)]`; when that
 * shift is negative the record is inconsistent and no note is linked.
 */

export const HEURISTIC_VERSION = '1';

/** Events shorter than this are suspect (a glitch or a split, not a note). */
export const SHORT_EVENT_MS = 120;
/** Mean clarity below this is suspect. */
export const LOW_CLARITY = 0.8;
/** Mean level (dBFS) below this is suspect. */
export const LOW_LEVEL_DB = -50;
/** A missing note whose window was at least this loud (dBFS) is suspect. */
export const HIGH_LEVEL_DB = -40;
/** Pitch spread within one event above this is unstable; at or below it, stable. */
export const PITCH_SPREAD_CENTS = 60;
/** A late or early note at least this far off can be a player's rhythm error. */
export const RHYTHM_OFFSET_MS = 150;
/** Other notes within this offset count as on time. */
export const ON_TIME_MS = 80;
/** Share of the other timed notes that must be on time for a rhythm outlier. */
export const ON_TIME_SHARE = 0.8;
/** At most this many reason codes per note or event. */
export const MAX_ITEM_REASONS = 6;

export type Verdict = 'player' | 'recognition' | 'uncertain' | 'ok';

export const VERDICTS: readonly Verdict[] = ['player', 'recognition', 'uncertain', 'ok'];

export const REASON_CODES = [
  // likely recognition errors
  'octaveJump',
  'twelfthJump',
  'shortEvent',
  'lowClarity',
  'lowLevel',
  'splitNote',
  'mergedNotes',
  'unstablePitch',
  'missingLoud',
  // likely player errors
  'wrongPitchStable',
  'rhythmOutlier',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** The record fields of one note-by-note row the heuristic reads. */
export interface EstimateNote {
  refIndex: number | null;
  playedIndex: number | null;
  expectedMidi: number | null;
  playedMidi: number | null;
  offsetMs: number | null;
  status: string;
  octaveOff: boolean;
  twelfthOff: boolean;
  /** Mean input level (dBFS) during the note's window; absent in older records. */
  windowLevelDb?: number | null;
}

/** The record fields of one raw event the heuristic reads. */
export interface EstimateEvent {
  durationMs: number;
  meanClarity: number;
  meanLevelDb: number;
  /** Spread of the frame pitches within the event, cents; absent in older records. */
  pitchSpreadCents?: number;
}

/** Frame totals of the whole attempt. */
export interface EstimateSignal {
  frames: number;
  voicedFrames: number;
  medianClarity: number | null;
}

export interface EstimateInput {
  notes: readonly EstimateNote[];
  events: readonly EstimateEvent[];
  signal?: EstimateSignal;
  ended: string;
}

export interface VerdictCounts {
  player: number;
  recognition: number;
  uncertain: number;
  ok: number;
}

export interface ItemVerdict {
  verdict: Verdict;
  reasons: string[];
}

export interface EstimateSignals {
  /** Share of frames without a detected pitch. */
  unvoicedRatio: number | null;
  medianClarity: number | null;
  /** Mean absolute deviation of the reference notes' onset offsets from their median, ms. */
  latencySpreadMs: number | null;
  /** Events per reference note. */
  eventsPerNote: number | null;
  stopped: boolean;
}

export interface RecognitionEstimate {
  heuristicVersion: string;
  /** 0..1, three decimals; null without reference notes. */
  estimatedAccuracy: number | null;
  noteCounts: VerdictCounts;
  eventCounts: VerdictCounts;
  /** Reason codes of the notes judged `recognition`, with their counts. */
  reasons: Record<string, number>;
  /** Aligned with the input notes. */
  notes: ItemVerdict[];
  /** Aligned with the input events. */
  events: ItemVerdict[];
  signals: EstimateSignals;
}

function emptyCounts(): VerdictCounts {
  return { player: 0, recognition: 0, uncertain: 0, ok: 0 };
}

function item(verdict: Verdict, reasons: ReasonCode[]): ItemVerdict {
  return { verdict, reasons: reasons.slice(0, MAX_ITEM_REASONS) };
}

/** Recognition suspects that the event alone shows. */
function eventSuspects(event: EstimateEvent): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (event.durationMs < SHORT_EVENT_MS) reasons.push('shortEvent');
  if (event.meanClarity < LOW_CLARITY) reasons.push('lowClarity');
  if (event.meanLevelDb < LOW_LEVEL_DB) reasons.push('lowLevel');
  if (event.pitchSpreadCents !== undefined && event.pitchSpreadCents > PITCH_SPREAD_CENTS) {
    reasons.push('unstablePitch');
  }
  return reasons;
}

function isStable(event: EstimateEvent): boolean {
  return (
    event.pitchSpreadCents !== undefined &&
    event.pitchSpreadCents <= PITCH_SPREAD_CENTS &&
    eventSuspects(event).length === 0
  );
}

function intervalSuspects(note: EstimateNote): ReasonCode[] {
  const interval =
    note.playedMidi !== null && note.expectedMidi !== null ? note.playedMidi - note.expectedMidi : null;
  if (note.octaveOff || (interval !== null && [12, -12, 24, -24].indexOf(interval) !== -1)) {
    return ['octaveJump'];
  }
  if (note.twelfthOff || interval === 19) {
    return ['twelfthJump'];
  }
  return [];
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function estimateRecognition(input: EstimateInput): RecognitionEstimate {
  const { notes, events } = input;
  const stopped = input.ended === 'stopped';

  const linkedCount = notes.filter((n) => n.playedIndex !== null).length;
  const shift = events.length - linkedCount;
  const eventOf = (note: EstimateNote): EstimateEvent | null =>
    note.playedIndex === null || shift < 0 ? null : (events[note.playedIndex + shift] ?? null);

  const byRef = new Map<number, EstimateNote>();
  const byPlayed = new Map<number, EstimateNote>();
  for (const note of notes) {
    if (note.refIndex !== null) byRef.set(note.refIndex, note);
    if (note.playedIndex !== null) byPlayed.set(note.playedIndex, note);
  }

  const refNotes = notes.filter((n) => n.refIndex !== null);
  let lastPlayedRef = -1;
  for (const note of refNotes) {
    if (note.playedIndex !== null && (note.refIndex as number) > lastPlayedRef) {
      lastPlayedRef = note.refIndex as number;
    }
  }

  /**
   * One reference note heard as several same-pitch events: a matched
   * reference note with an extra note of its pitch right next to it, or an
   * extra note whose run of same-pitch extra notes reaches such a reference
   * note.
   */
  function isSplit(note: EstimateNote): boolean {
    if (note.playedIndex === null || note.playedMidi === null) return false;
    for (const step of [-1, 1]) {
      const first = byPlayed.get(note.playedIndex + step);
      if (note.refIndex !== null) {
        if (first && first.refIndex === null && first.playedMidi === note.playedMidi) return true;
        continue;
      }
      let index = note.playedIndex + step;
      let neighbour = first;
      while (neighbour && neighbour.playedMidi === note.playedMidi) {
        if (neighbour.refIndex !== null) return true;
        index += step;
        neighbour = byPlayed.get(index);
      }
    }
    return false;
  }

  /** A missing reference note next to a repeated one (same pitch) that was played right. */
  function isMerged(note: EstimateNote): boolean {
    if (note.refIndex === null || note.expectedMidi === null) return false;
    for (const step of [-1, 1]) {
      const neighbour = byRef.get(note.refIndex + step);
      if (
        neighbour &&
        neighbour.expectedMidi === note.expectedMidi &&
        neighbour.playedIndex !== null &&
        neighbour.playedMidi === neighbour.expectedMidi
      ) {
        return true;
      }
    }
    return false;
  }

  function isRhythmOutlier(note: EstimateNote): boolean {
    if ((note.status !== 'late' && note.status !== 'early') || note.offsetMs === null) return false;
    if (Math.abs(note.offsetMs) < RHYTHM_OFFSET_MS) return false;
    const others = refNotes.filter((n) => n !== note && n.offsetMs !== null);
    if (others.length < 2) return false;
    const onTime = others.filter((n) => Math.abs(n.offsetMs as number) <= ON_TIME_MS).length;
    return onTime / others.length >= ON_TIME_SHARE;
  }

  function classify(note: EstimateNote): ItemVerdict {
    if (note.refIndex !== null && note.playedIndex === null) {
      if (stopped && note.refIndex > lastPlayedRef) return item('uncertain', []);
      const reasons: ReasonCode[] = [];
      if (isMerged(note)) reasons.push('mergedNotes');
      if (note.windowLevelDb !== undefined && note.windowLevelDb !== null && note.windowLevelDb >= HIGH_LEVEL_DB) {
        reasons.push('missingLoud');
      }
      return item(reasons.length > 0 ? 'recognition' : 'uncertain', reasons);
    }
    const event = eventOf(note);
    const suspects = event ? eventSuspects(event) : [];
    if (note.status === 'good') {
      return suspects.length > 0 ? item('uncertain', suspects) : item('ok', []);
    }
    const reasons: ReasonCode[] = [...intervalSuspects(note), ...suspects];
    if (isSplit(note)) reasons.push('splitNote');
    if (reasons.length > 0) return item('recognition', reasons);
    if (note.refIndex !== null && event) {
      if (note.status === 'wrongPitch' && isStable(event)) return item('player', ['wrongPitchStable']);
      if (isRhythmOutlier(note)) return item('player', ['rhythmOutlier']);
    }
    return item('uncertain', []);
  }

  const noteVerdicts = notes.map(classify);

  const eventVerdicts = events.map((event, index): ItemVerdict => {
    const note = shift < 0 ? undefined : byPlayed.get(index - shift);
    if (note) {
      const verdict = noteVerdicts[notes.indexOf(note)];
      return { verdict: verdict.verdict, reasons: verdict.reasons.slice() };
    }
    const suspects = eventSuspects(event);
    return item(suspects.length > 0 ? 'recognition' : 'uncertain', suspects);
  });

  const noteCounts = emptyCounts();
  const reasons: Record<string, number> = {};
  noteVerdicts.forEach((v) => {
    noteCounts[v.verdict] += 1;
    if (v.verdict === 'recognition') {
      for (const code of v.reasons) reasons[code] = (reasons[code] ?? 0) + 1;
    }
  });
  const eventCounts = emptyCounts();
  eventVerdicts.forEach((v) => {
    eventCounts[v.verdict] += 1;
  });

  const recognitionRefs = notes.filter(
    (n, i) => n.refIndex !== null && noteVerdicts[i].verdict === 'recognition',
  ).length;
  const estimatedAccuracy =
    refNotes.length === 0
      ? null
      : Math.round(Math.min(1, Math.max(0, 1 - recognitionRefs / refNotes.length)) * 1000) / 1000;

  const offsets = refNotes.filter((n) => n.offsetMs !== null).map((n) => n.offsetMs as number);
  let latencySpreadMs: number | null = null;
  if (offsets.length >= 2) {
    const mid = median(offsets);
    latencySpreadMs = Math.round(offsets.reduce((sum, o) => sum + Math.abs(o - mid), 0) / offsets.length);
  }
  const signal = input.signal;

  return {
    heuristicVersion: HEURISTIC_VERSION,
    estimatedAccuracy,
    noteCounts,
    eventCounts,
    reasons,
    notes: noteVerdicts,
    events: eventVerdicts,
    signals: {
      unvoicedRatio:
        signal && signal.frames > 0
          ? Math.round(Math.min(1, Math.max(0, 1 - signal.voicedFrames / signal.frames)) * 1000) / 1000
          : null,
      medianClarity: signal ? signal.medianClarity : null,
      latencySpreadMs,
      eventsPerNote: refNotes.length === 0 ? null : Math.round((events.length / refNotes.length) * 1000) / 1000,
      stopped,
    },
  };
}

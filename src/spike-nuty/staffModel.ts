// Pure mapping from the comparison result to what the staff draws: VexFlow
// keys, durations, colours and the split into bars, both rows filling every
// bar exactly so one formatter can line them up in time. Staff.tsx only draws.
import type { CompareResult, Melody, NoteGrade } from './logic/index.ts';
import { pitchClass } from './logic/index.ts';

export type VexDuration = '8' | 'q' | 'qd' | 'h' | 'hd' | 'w';

export const GRADE_COLOURS: Record<NoteGrade, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
};
export const UNGRADED_COLOUR = '#000000';
export const EXTRA_COLOUR = '#6b7280';
export const REST_COLOUR = '#9ca3af';
export const HIGHLIGHT_COLOUR = '#2563eb';

const LETTERS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;

/** Renderable durations, shortest first, in eighths. */
const DURATIONS: Array<[eighths: number, duration: VexDuration]> = [
  [1, '8'],
  [2, 'q'],
  [3, 'qd'],
  [4, 'h'],
  [6, 'hd'],
  [8, 'w'],
];

export const EIGHTHS_PER_BAR = 8;

/** MIDI (written pitch) → VexFlow key, e.g. 52 → `e/3`, 54 → `f#/3`. */
export function midiToVexKey(midi: number): string {
  return `${LETTERS[pitchClass(midi)]}/${Math.floor(midi / 12) - 1}`;
}

/** The accidental to attach, if any (sharps only). */
export function accidentalFor(midi: number): '#' | null {
  return LETTERS[pitchClass(midi)].endsWith('#') ? '#' : null;
}

/** Nearest renderable duration without ties; on a tie the shorter one. */
export function eighthsToDuration(eighths: number): VexDuration {
  let best = DURATIONS[0];
  for (const candidate of DURATIONS) {
    if (Math.abs(candidate[0] - eighths) < Math.abs(best[0] - eighths)) best = candidate;
  }
  return best[1];
}

/** Largest renderable duration not longer than `eighths` (at least an eighth). */
export function floorDuration(eighths: number): [eighths: number, duration: VexDuration] {
  let best = DURATIONS[0];
  for (const candidate of DURATIONS) if (candidate[0] <= eighths) best = candidate;
  return best;
}

export function gradeColour(grade: NoteGrade | 'extra' | null): string {
  if (grade === null) return UNGRADED_COLOUR;
  return grade === 'extra' ? EXTRA_COLOUR : GRADE_COLOURS[grade];
}

export interface StaffSlot {
  kind: 'note' | 'rest';
  /** VexFlow key; rests sit on `b/4`. */
  key: string;
  accidental: '#' | null;
  duration: VexDuration;
  colour: string;
  startEighth: number;
  refIndex: number | null;
  playedIndex: number | null;
}

export interface AlignedBar {
  reference: StaffSlot[];
  /** Null when only the reference is drawn (before a result exists). */
  played: StaffSlot[] | null;
}

const REST_KEY = 'b/4';

function noteSlot(
  midi: number,
  startEighth: number,
  duration: VexDuration,
  colour: string,
  refIndex: number | null,
  playedIndex: number | null,
): StaffSlot {
  return {
    kind: 'note',
    key: midiToVexKey(midi),
    accidental: accidentalFor(midi),
    duration,
    colour,
    startEighth,
    refIndex,
    playedIndex,
  };
}

/** Rests covering `[start, start + length)`, longest pieces first. */
function rests(start: number, length: number, colour: string, refIndex: number | null = null): StaffSlot[] {
  const out: StaffSlot[] = [];
  let at = start;
  let left = length;
  while (left > 0) {
    const [eighths, duration] = floorDuration(left);
    out.push({
      kind: 'rest',
      key: REST_KEY,
      accidental: null,
      duration,
      colour,
      startEighth: at,
      refIndex,
      playedIndex: null,
    });
    at += eighths;
    left -= eighths;
  }
  return out;
}

/** A note of `length` eighths: the largest renderable value, the remainder as neutral rests (no ties). */
function noteWithRest(
  midi: number,
  start: number,
  length: number,
  colour: string,
  refIndex: number | null,
  playedIndex: number | null,
): StaffSlot[] {
  const [eighths, duration] = floorDuration(length);
  return [
    noteSlot(midi, start, duration, colour, refIndex, playedIndex),
    ...rests(start + eighths, length - eighths, REST_COLOUR),
  ];
}

interface ColouredRef {
  midi: number;
  startEighth: number;
  durationEighths: number;
  colour: string;
}

function referenceRow(notes: ColouredRef[], bar: number): StaffSlot[] {
  const barStart = bar * EIGHTHS_PER_BAR;
  const barEnd = barStart + EIGHTHS_PER_BAR;
  const row: StaffSlot[] = [];
  let cursor = barStart;
  notes.forEach((r, refIndex) => {
    if (r.startEighth < cursor || r.startEighth >= barEnd) return;
    row.push(...rests(cursor, r.startEighth - cursor, REST_COLOUR));
    const length = Math.min(r.durationEighths, barEnd - r.startEighth);
    row.push(...noteWithRest(r.midi, r.startEighth, length, r.colour, refIndex, null));
    cursor = r.startEighth + length;
  });
  row.push(...rests(cursor, barEnd - cursor, REST_COLOUR));
  return row;
}

function melodyLength(notes: Array<{ startEighth: number; durationEighths: number }>): number {
  return notes.reduce((end, n) => Math.max(end, n.startEighth + n.durationEighths), 0);
}

/** The reference melody alone, black, with one note optionally highlighted (while playing). */
export function referenceBars(melody: Melody, highlightIndex: number | null = null): AlignedBar[] {
  const notes = melody.notes.map((n, i) => ({
    ...n,
    colour: i === highlightIndex ? HIGHLIGHT_COLOUR : UNGRADED_COLOUR,
  }));
  return Array.from({ length: Math.ceil(melodyLength(notes) / EIGHTHS_PER_BAR) }, (_, bar) => ({
    reference: referenceRow(notes, bar),
    played: null,
  }));
}

/**
 * Both rows per bar, each filling exactly 8 eighths, so a played note stands
 * under the reference note of the same eighth. Played notes are clipped to
 * the next played onset and the bar end; a missing reference note shows as a
 * red rest at its onset where nothing is played; extras are grey.
 */
export function toAlignedBars(result: CompareResult, melodyLengthEighths: number): AlignedBar[] {
  const barOf = (eighth: number) => Math.floor(eighth / EIGHTHS_PER_BAR);
  const barCount = Math.max(
    Math.ceil(melodyLengthEighths / EIGHTHS_PER_BAR),
    ...result.played.map((p) => barOf(p.note.startEighth) + 1),
  );
  const refNotes = result.reference.map((r) => ({ ...r.note, colour: gradeColour(r.grade) }));

  // Played notes by onset; on a shared eighth keep the matched one, else the first.
  const byOnset = new Map<number, number>();
  result.played.forEach((p, j) => {
    const kept = byOnset.get(p.note.startEighth);
    if (kept === undefined || (result.played[kept].grade === 'extra' && p.grade !== 'extra')) {
      byOnset.set(p.note.startEighth, j);
    }
  });
  const onsets = [...byOnset.keys()].sort((a, b) => a - b);

  return Array.from({ length: barCount }, (_, bar) => {
    const barStart = bar * EIGHTHS_PER_BAR;
    const barEnd = barStart + EIGHTHS_PER_BAR;

    // Which played note covers each eighth of the bar, and for how long.
    const covered = new Array<number | null>(EIGHTHS_PER_BAR).fill(null);
    const lengthOf = new Map<number, number>();
    onsets.forEach((onset, k) => {
      if (onset < barStart || onset >= barEnd) return;
      const j = byOnset.get(onset) as number;
      const next = k + 1 < onsets.length ? onsets[k + 1] : Infinity;
      const length = Math.min(result.played[j].note.durationEighths, next - onset, barEnd - onset);
      lengthOf.set(j, Math.max(1, length));
      for (let e = onset; e < onset + Math.max(1, length); e += 1) covered[e - barStart] = j;
    });

    // Missing reference notes: red rests from the onset over the free part of the span.
    const restRef = new Array<number | null>(EIGHTHS_PER_BAR).fill(null);
    result.reference.forEach((r, i) => {
      if (r.playedIndex !== null || barOf(r.note.startEighth) !== bar) return;
      const end = Math.min(r.note.startEighth + r.note.durationEighths, barEnd);
      for (let e = r.note.startEighth; e < end && covered[e - barStart] === null; e += 1) {
        restRef[e - barStart] = i;
      }
    });

    const played: StaffSlot[] = [];
    let e = 0;
    while (e < EIGHTHS_PER_BAR) {
      const j = covered[e];
      if (j !== null) {
        const p = result.played[j];
        const length = lengthOf.get(j) as number;
        played.push(...noteWithRest(p.note.midi, barStart + e, length, gradeColour(p.grade), null, j));
        e += length;
        continue;
      }
      const ref = restRef[e];
      let end = e + 1;
      while (end < EIGHTHS_PER_BAR && covered[end] === null && restRef[end] === ref) end += 1;
      played.push(...rests(barStart + e, end - e, ref === null ? REST_COLOUR : GRADE_COLOURS.red, ref));
      e = end;
    }

    const hasRef = refNotes.some((r) => barOf(r.startEighth) === bar);
    return {
      reference: hasRef ? referenceRow(refNotes, bar) : rests(barStart, EIGHTHS_PER_BAR, REST_COLOUR),
      played,
    };
  });
}

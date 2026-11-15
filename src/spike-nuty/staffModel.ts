// Pure mapping from the comparison result to what the staff draws: VexFlow
// keys, durations, colours and the split into bars. Staff.tsx only draws.
import type { CompareResult, NoteGrade } from './logic/index.ts';
import { pitchClass } from './logic/index.ts';

export type VexDuration = '8' | 'q' | 'qd' | 'h' | 'hd' | 'w';

export const GRADE_COLOURS: Record<NoteGrade, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
};
export const UNGRADED_COLOUR = '#000000';

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

export function gradeColour(grade: NoteGrade | 'extra' | null): string {
  if (grade === null) return UNGRADED_COLOUR;
  return grade === 'extra' ? GRADE_COLOURS.red : GRADE_COLOURS[grade];
}

export interface StaffNote {
  key: string;
  accidental: '#' | null;
  duration: VexDuration;
  colour: string;
}

export interface StaffBar {
  reference: StaffNote[];
  played: StaffNote[];
}

function toStaffNote(midi: number, durationEighths: number, grade: NoteGrade | 'extra' | null): StaffNote {
  return {
    key: midiToVexKey(midi),
    accidental: accidentalFor(midi),
    duration: eighthsToDuration(durationEighths),
    colour: gradeColour(grade),
  };
}

/** Both staves split into bars of 4/4 by onset; the played staff may overflow a bar. */
export function toStaffBars(
  reference: CompareResult['reference'],
  played: CompareResult['played'],
): StaffBar[] {
  const barOf = (startEighth: number) => Math.floor(startEighth / EIGHTHS_PER_BAR);
  const lastBar = Math.max(
    -1,
    ...reference.map((r) => barOf(r.note.startEighth)),
    ...played.map((p) => barOf(p.note.startEighth)),
  );
  const bars: StaffBar[] = Array.from({ length: lastBar + 1 }, () => ({ reference: [], played: [] }));
  for (const r of reference) {
    bars[barOf(r.note.startEighth)].reference.push(toStaffNote(r.note.midi, r.note.durationEighths, r.grade));
  }
  for (const p of played) {
    bars[barOf(p.note.startEighth)].played.push(toStaffNote(p.note.midi, p.note.durationEighths, p.grade));
  }
  return bars;
}

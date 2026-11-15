// Pure helpers behind the child-facing result view: the summary counts, the
// note-by-note list, Polish note names and the note the child is on while
// playing. Texts come from copy.ts.
import * as copy from './copy.ts';
import {
  eighthMs,
  pitchClass,
  type CompareResult,
  type Melody,
  type NoteGrade,
} from './logic/index.ts';

/** Polish note names (H for B, sharps as -is), written pitch. */
const POLISH_NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'] as const;

/** e.g. 67 → "G4", 59 → "H3", 66 → "Fis4". */
export function midiToPolishName(midi: number): string {
  return `${POLISH_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`;
}

/** Index of the reference note sounding at `eighth`, or null outside the melody. */
export function refIndexAt(melody: Melody, eighth: number): number | null {
  const index = melody.notes.findIndex(
    (note) => eighth >= note.startEighth && eighth < note.startEighth + note.durationEighths,
  );
  return index === -1 ? null : index;
}

type RefEntry = CompareResult['reference'][number];
/** Why a note got its grade; the keys of copy.STATUS. */
export type NoteKind = keyof typeof copy.STATUS;
type Kind = NoteKind;

/** Why a reference note got its grade. */
function kindOf(r: RefEntry, result: CompareResult): Kind {
  if (r.grade === 'green') return 'good';
  if (r.playedIndex === null) return 'missing';
  if (r.grade === 'red') return 'wrongPitch';
  const played = result.played[r.playedIndex].note;
  if (played.startEighth > r.note.startEighth) return 'late';
  if (played.startEighth < r.note.startEighth) return 'early';
  return 'rhythm';
}

export function summarize(result: CompareResult): copy.SummaryCounts {
  const counts: copy.SummaryCounts = {
    total: result.reference.length,
    good: 0,
    late: 0,
    early: 0,
    rhythm: 0,
    wrongPitch: 0,
    missing: 0,
    extra: result.played.filter((p) => p.grade === 'extra').length,
  };
  for (const r of result.reference) counts[kindOf(r, result)] += 1;
  return counts;
}

export interface NoteRow {
  nr: number;
  expected: string;
  played: string;
  /** Played minus expected pitch in cents; null when nothing was matched. */
  centsDiff: number | null;
  /** Played onset minus expected onset, ms; null for missing and extra notes. */
  offsetMs: number | null;
  timing: string;
  status: string;
  /** Machine-readable reason behind `status`. */
  kind: NoteKind;
  /** Written MIDI number of the reference note; null for an extra note. */
  expectedMidi: number | null;
  /** Written MIDI number of the played note; null for a missing note. */
  playedMidi: number | null;
  grade: NoteGrade | 'extra';
  refIndex: number | null;
  playedIndex: number | null;
}

/**
 * One row per reference note plus one per extra played note, in time order.
 * Played onsets are taken as graded (after the latency correction).
 */
export function noteRows(result: CompareResult, bpm: number): NoteRow[] {
  const eighth = eighthMs(bpm);
  const entries: Array<{ at: number; order: number; row: Omit<NoteRow, 'nr'> }> = [];

  result.reference.forEach((r, refIndex) => {
    const kind = kindOf(r, result);
    const played = r.playedIndex === null ? null : result.played[r.playedIndex].note;
    const offsetMs = played ? Math.round(played.startMs - r.note.startEighth * eighth) : null;
    let timing: string = copy.NONE;
    if (played && offsetMs !== null) {
      // Late/early keep only the signed offset: the status word is in the Ocena column.
      if (kind === 'rhythm')
        timing = played.durationEighths < r.note.durationEighths ? copy.TOO_SHORT : copy.TOO_LONG;
      else timing = copy.signedMs(offsetMs);
    }
    entries.push({
      at: r.note.startEighth,
      order: 0,
      row: {
        expected: midiToPolishName(r.note.midi),
        played: played ? midiToPolishName(played.midi) : copy.NONE,
        centsDiff: played ? (played.midi - r.note.midi) * 100 + played.meanCents : null,
        offsetMs,
        timing,
        status: copy.STATUS[kind],
        kind,
        expectedMidi: r.note.midi,
        playedMidi: played ? played.midi : null,
        grade: r.grade,
        refIndex,
        playedIndex: r.playedIndex,
      },
    });
  });

  result.played.forEach((p, playedIndex) => {
    if (p.grade !== 'extra') return;
    entries.push({
      at: p.note.startEighth,
      order: 1,
      row: {
        expected: copy.NONE,
        played: midiToPolishName(p.note.midi),
        centsDiff: null,
        offsetMs: null,
        timing: copy.NONE,
        status: copy.STATUS.extra,
        kind: 'extra',
        expectedMidi: null,
        playedMidi: p.note.midi,
        grade: 'extra',
        refIndex: null,
        playedIndex,
      },
    });
  });

  return entries
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ row }, i) => ({ nr: i + 1, ...row }));
}

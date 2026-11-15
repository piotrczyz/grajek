// Comparison: align the played notes (written pitch) to the melody by edit
// distance on pitch, with the onset distance as a tie-breaker, then grade.

import type { Melody, RefNote } from './melodies.ts';
import { pitchClass } from './pitch.ts';
import type { QuantizedNote } from './quantize.ts';

export interface CompareOptions {
  ignoreOctave: boolean;
  onsetToleranceEighths: number;
  durationToleranceEighths: number;
}

export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
  ignoreOctave: false,
  onsetToleranceEighths: 0,
  durationToleranceEighths: 1,
};

export type NoteGrade = 'green' | 'yellow' | 'red';

export interface CompareResult {
  reference: Array<{ note: RefNote; grade: NoteGrade; playedIndex: number | null }>;
  played: Array<{ note: QuantizedNote; grade: NoteGrade | 'extra' }>;
  /** round(100 · (green + 0.5 · yellow) / reference count). */
  scorePercent: number;
  /** round(100 · (green + yellow) / reference count): pitch only. */
  pitchPercent: number;
}

/** Edit cost and summed onset distance, compared lexicographically. */
type Cost = [edits: number, onset: number];
type Move = 'match' | 'skipRef' | 'skipPlayed';

const less = (a: Cost, b: Cost) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

export function compare(
  melody: Melody,
  played: QuantizedNote[],
  options: Partial<CompareOptions> = {},
): CompareResult {
  const opts: CompareOptions = { ...DEFAULT_COMPARE_OPTIONS, ...options };
  const ref = melody.notes;
  const n = ref.length;
  const m = played.length;
  const samePitch = (a: number, b: number) =>
    opts.ignoreOctave ? pitchClass(a) === pitchClass(b) : a === b;

  const cost: Cost[][] = Array.from({ length: n + 1 }, () => new Array<Cost>(m + 1));
  const move: Move[][] = Array.from({ length: n + 1 }, () => new Array<Move>(m + 1));
  cost[0][0] = [0, 0];
  for (let i = 1; i <= n; i += 1) {
    cost[i][0] = [i, 0];
    move[i][0] = 'skipRef';
  }
  for (let j = 1; j <= m; j += 1) {
    cost[0][j] = [j, 0];
    move[0][j] = 'skipPlayed';
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const r = ref[i - 1];
      const p = played[j - 1];
      const diag = cost[i - 1][j - 1];
      let best: Cost = [
        diag[0] + (samePitch(r.midi, p.midi) ? 0 : 1),
        diag[1] + Math.abs(r.startEighth - p.startEighth),
      ];
      let bestMove: Move = 'match';
      const up: Cost = [cost[i - 1][j][0] + 1, cost[i - 1][j][1]];
      if (less(up, best)) {
        best = up;
        bestMove = 'skipRef';
      }
      const left: Cost = [cost[i][j - 1][0] + 1, cost[i][j - 1][1]];
      if (less(left, best)) {
        best = left;
        bestMove = 'skipPlayed';
      }
      cost[i][j] = best;
      move[i][j] = bestMove;
    }
  }

  const playedFor = new Array<number | null>(n).fill(null);
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const step = move[i][j];
    if (step === 'match') {
      playedFor[i - 1] = j - 1;
      i -= 1;
      j -= 1;
    } else if (step === 'skipRef') {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const playedGrades = new Array<NoteGrade | 'extra'>(m).fill('extra');
  const reference = ref.map((note, i) => {
    const playedIndex = playedFor[i];
    let grade: NoteGrade = 'red';
    if (playedIndex !== null) {
      const p = played[playedIndex];
      if (samePitch(note.midi, p.midi)) {
        const onsetOk = Math.abs(p.startEighth - note.startEighth) <= opts.onsetToleranceEighths;
        const durationOk =
          Math.abs(p.durationEighths - note.durationEighths) <= opts.durationToleranceEighths;
        grade = onsetOk && durationOk ? 'green' : 'yellow';
      }
      playedGrades[playedIndex] = grade;
    }
    return { note, grade, playedIndex };
  });

  const green = reference.filter((r) => r.grade === 'green').length;
  const yellow = reference.filter((r) => r.grade === 'yellow').length;
  return {
    reference,
    played: played.map((note, j) => ({ note, grade: playedGrades[j] })),
    scorePercent: n === 0 ? 0 : Math.round((100 * (green + 0.5 * yellow)) / n),
    pitchPercent: n === 0 ? 0 : Math.round((100 * (green + yellow)) / n),
  };
}

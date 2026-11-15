import { describe, expect, it } from 'vitest';
import { compare, MELODIES, type Melody, type QuantizedNote, type RefNote } from './logic/index.ts';
import { midiToPolishName, noteRows, refIndexAt, summarize } from './results.ts';

const melody: Melody = MELODIES.find((m) => m.id === 'panie-janie') as Melody;
const EIGHTH = 500; // 60 BPM

function play(note: RefNote, overrides: Partial<QuantizedNote> = {}): QuantizedNote {
  return {
    midi: note.midi,
    startMs: note.startEighth * EIGHTH,
    durationMs: note.durationEighths * EIGHTH,
    meanCents: 0,
    frames: 10,
    suspectOctave: 0,
    suspectTwelfth: 0,
    startEighth: note.startEighth,
    durationEighths: note.durationEighths,
    ...overrides,
  };
}

/** Panie Janie with: note 1 late (+600 ms), note 2 early, note 3 a semitone high, note 4 missing, an extra at the end. */
function mixed() {
  const n = melody.notes;
  const played: QuantizedNote[] = [
    play(n[0], { startMs: 40 }),
    play(n[1], { startMs: n[1].startEighth * EIGHTH + 600, startEighth: n[1].startEighth + 1, durationEighths: 1 }),
    play(n[2], { startMs: n[2].startEighth * EIGHTH - 400, startEighth: n[2].startEighth - 1, durationEighths: 3 }),
    play(n[3], { midi: n[3].midi + 1, meanCents: -12 }),
    ...n.slice(5).map((note) => play(note)),
    play(n[n.length - 1], { midi: 50, startEighth: 33, startMs: 33 * EIGHTH }),
  ];
  return compare(melody, played);
}

describe('midiToPolishName', () => {
  it('uses Polish letters', () => {
    expect(midiToPolishName(67)).toBe('G4');
    expect(midiToPolishName(59)).toBe('H3');
    expect(midiToPolishName(66)).toBe('Fis4');
    expect(midiToPolishName(52)).toBe('E3');
    expect(midiToPolishName(70)).toBe('Ais4');
  });
});

describe('refIndexAt', () => {
  it('finds the note sounding at an eighth', () => {
    expect(refIndexAt(melody, 0)).toBe(0);
    expect(refIndexAt(melody, 1)).toBe(0);
    // "G4h" in bar 3 starts at eighth 20 and lasts 4 eighths.
    expect(melody.notes[10].durationEighths).toBe(4);
    expect(refIndexAt(melody, 23)).toBe(10);
    expect(refIndexAt(melody, 32)).toBeNull();
    expect(refIndexAt(melody, -1)).toBeNull();
  });
});

describe('summarize', () => {
  it('counts good, late, early, wrong, missing and extra notes', () => {
    expect(summarize(mixed())).toEqual({
      total: 14,
      good: 10,
      late: 1,
      early: 1,
      rhythm: 0,
      wrongPitch: 1,
      missing: 1,
      extra: 1,
    });
  });

  it('counts a duration-only yellow as rhythm', () => {
    const played = melody.notes.map((note, i) => play(note, i === 0 ? { durationEighths: 5 } : {}));
    expect(summarize(compare(melody, played)).rhythm).toBe(1);
  });
});

describe('noteRows', () => {
  it('describes every reference note and every extra in time order', () => {
    const rows = noteRows(mixed(), 60);
    expect(rows).toHaveLength(15);
    expect(rows.map((r) => r.nr)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(rows[0]).toMatchObject({ expected: 'C4', played: 'C4', status: 'dobrze', timing: '+40 ms', grade: 'green' });
    expect(rows[1]).toMatchObject({ status: 'za późno', timing: '+600 ms, za późno', offsetMs: 600, grade: 'yellow' });
    expect(rows[2]).toMatchObject({ status: 'za wcześnie', timing: '\u2212400 ms, za wcześnie', offsetMs: -400 });
    expect(rows[3]).toMatchObject({ expected: 'C4', played: 'Cis4', centsDiff: 88, status: 'zła nuta', grade: 'red' });
    expect(rows[4]).toMatchObject({ played: '–', centsDiff: null, offsetMs: null, timing: '–', status: 'brak' });
    expect(rows[4].playedIndex).toBeNull();
    expect(rows[14]).toMatchObject({ expected: '–', played: 'D3', status: 'dodatkowa', grade: 'extra', refIndex: null });
  });

  it('says too short or too long for a duration-only yellow', () => {
    const short = melody.notes.map((note, i) => play(note, i === 10 ? { durationEighths: 2 } : {}));
    expect(noteRows(compare(melody, short), 60)[10]).toMatchObject({ status: 'zły rytm', timing: 'za krótko' });
    const long = melody.notes.map((note, i) => play(note, i === 0 ? { durationEighths: 5 } : {}));
    expect(noteRows(compare(melody, long), 60)[0]).toMatchObject({ status: 'zły rytm', timing: 'za długo' });
  });
});

import { describe, expect, it } from 'vitest';
import { MELODIES, melodyLengthEighths } from './melodies.ts';

const E3 = 52;
const G4 = 67;
const A_SHARP_4 = 70;
const EIGHTHS_PER_BAR = 8;

describe('MELODIES', () => {
  it('has three melodies with distinct ids', () => {
    expect(MELODIES).toHaveLength(3);
    expect(new Set(MELODIES.map((m) => m.id)).size).toBe(3);
    expect(MELODIES.map((m) => m.id)).toEqual(['wlazl-kotek', 'panie-janie', 'cwiczenie-efg']);
  });

  it.each(MELODIES)('$id: every bar sums to 8 eighths and no note crosses a bar line', (melody) => {
    const length = melodyLengthEighths(melody);
    expect(length % EIGHTHS_PER_BAR).toBe(0);
    const perBar = new Array<number>(length / EIGHTHS_PER_BAR).fill(0);
    let cursor = 0;
    for (const note of melody.notes) {
      expect(note.startEighth).toBe(cursor);
      const bar = Math.floor(note.startEighth / EIGHTHS_PER_BAR);
      expect(Math.floor((note.startEighth + note.durationEighths - 1) / EIGHTHS_PER_BAR)).toBe(bar);
      perBar[bar] += note.durationEighths;
      cursor += note.durationEighths;
    }
    expect(perBar.every((sum) => sum === EIGHTHS_PER_BAR)).toBe(true);
  });

  it.each(MELODIES)('$id: every pitch is within E3-G4 written and below A#4', (melody) => {
    for (const note of melody.notes) {
      expect(note.midi).toBeGreaterThanOrEqual(E3);
      expect(note.midi).toBeLessThanOrEqual(G4);
      expect(note.midi).toBeLessThan(A_SHARP_4);
    }
  });

  it('starts "Wlazł kotek" on G4 and ends "Panie Janie" with a half-note G4', () => {
    expect(MELODIES[0].notes[0]).toEqual({ midi: G4, startEighth: 0, durationEighths: 2 });
    const last = MELODIES[1].notes.at(-1);
    expect(last).toEqual({ midi: G4, startEighth: 28, durationEighths: 4 });
  });
});

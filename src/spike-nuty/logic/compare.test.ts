import { describe, expect, it } from 'vitest';
import { compare } from './compare.ts';
import { MELODIES, type Melody, type RefNote } from './melodies.ts';
import type { QuantizedNote } from './quantize.ts';

const melody: Melody = MELODIES.find((m) => m.id === 'panie-janie') as Melody;

function play(note: RefNote, overrides: Partial<QuantizedNote> = {}): QuantizedNote {
  return {
    midi: note.midi,
    startMs: note.startEighth * 500,
    durationMs: note.durationEighths * 500,
    meanCents: 0,
    frames: 10,
    suspectOctave: 0,
    suspectTwelfth: 0,
    startEighth: note.startEighth,
    durationEighths: note.durationEighths,
    ...overrides,
  };
}

const perfect = () => melody.notes.map((note) => play(note));

describe('compare', () => {
  it('scores a perfect performance 100 with all green', () => {
    const result = compare(melody, perfect());
    expect(result.scorePercent).toBe(100);
    expect(result.pitchPercent).toBe(100);
    expect(result.reference.every((r) => r.grade === 'green')).toBe(true);
    expect(result.reference.map((r) => r.playedIndex)).toEqual(melody.notes.map((_, i) => i));
    expect(result.played.every((p) => p.grade === 'green')).toBe(true);
  });

  it('grades a note one eighth late as yellow', () => {
    const played = perfect();
    const note = melody.notes[3];
    played[3] = play(note, { startEighth: note.startEighth + 1, durationEighths: note.durationEighths - 1 });
    const result = compare(melody, played);
    expect(result.reference[3].grade).toBe('yellow');
    expect(result.played[3].grade).toBe('yellow');
    expect(result.reference.filter((r) => r.grade === 'green')).toHaveLength(melody.notes.length - 1);
    expect(result.scorePercent).toBe(Math.round((100 * (melody.notes.length - 0.5)) / melody.notes.length));
    expect(result.pitchPercent).toBe(100);
  });

  it('grades a wrong pitch as red', () => {
    const played = perfect();
    played[2] = play(melody.notes[2], { midi: melody.notes[2].midi + 1 });
    const result = compare(melody, played);
    expect(result.reference[2].grade).toBe('red');
    expect(result.reference[2].playedIndex).toBe(2);
    expect(result.played[2].grade).toBe('red');
  });

  it('grades a missing note as red with playedIndex null', () => {
    const played = perfect();
    played.splice(5, 1);
    const result = compare(melody, played);
    expect(result.reference[5].grade).toBe('red');
    expect(result.reference[5].playedIndex).toBeNull();
    expect(result.reference.filter((r) => r.grade === 'green')).toHaveLength(melody.notes.length - 1);
    expect(result.played.every((p) => p.grade === 'green')).toBe(true);
  });

  it('marks an extra note as extra without lowering the score', () => {
    const played = perfect();
    const extra = play({ midi: 70, startEighth: 9, durationEighths: 1 });
    played.splice(5, 0, extra);
    const result = compare(melody, played);
    expect(result.played[5].grade).toBe('extra');
    expect(result.scorePercent).toBe(100);
    expect(result.reference.every((r) => r.grade === 'green')).toBe(true);
  });

  it('grades a note an octave off red by default and green with ignoreOctave', () => {
    const played = perfect();
    played[4] = play(melody.notes[4], { midi: melody.notes[4].midi + 12 });
    expect(compare(melody, played).reference[4].grade).toBe('red');
    expect(compare(melody, played, { ignoreOctave: true }).reference[4].grade).toBe('green');
  });

  it('scores 0 when nothing was played', () => {
    const result = compare(melody, []);
    expect(result.scorePercent).toBe(0);
    expect(result.reference.every((r) => r.grade === 'red' && r.playedIndex === null)).toBe(true);
  });
});

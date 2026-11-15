import { describe, expect, it } from 'vitest';
import { MELODIES, type Melody, type RefNote } from './melodies.ts';
import type { NoteEvent } from './segment.ts';
import { gradeRecording, median, MAX_CORRECTION_MS } from './timing.ts';

const melody: Melody = MELODIES.find((m) => m.id === 'panie-janie') as Melody;
const BPM = 100;
const EIGHTH = 300;

function event(note: RefNote, shiftMs: number, midiShift = 0): NoteEvent {
  return {
    midi: note.midi + midiShift,
    startMs: note.startEighth * EIGHTH + shiftMs,
    durationMs: note.durationEighths * EIGHTH,
    meanCents: 0,
    frames: 10,
    suspectOctave: 0,
    suspectTwelfth: 0,
    meanClarity: 1,
    meanLevelDb: -20,
  };
}

const shifted = (shiftMs: number) => melody.notes.map((note) => event(note, shiftMs));

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('gradeRecording', () => {
  it('turns a steady +200 ms lag from all yellow into all green', () => {
    const raw = gradeRecording(melody, shifted(200), BPM, { ignoreOctave: false, autoLatency: false });
    expect(raw.result.reference.every((r) => r.grade === 'yellow')).toBe(true);
    expect(raw.correctionMs).toBe(0);
    expect(raw.medianMs).toBe(200);

    const fixed = gradeRecording(melody, shifted(200), BPM, { ignoreOctave: false, autoLatency: true });
    expect(fixed.result.reference.every((r) => r.grade === 'green')).toBe(true);
    expect(fixed.correctionMs).toBeCloseTo(200);
    expect(fixed.samples).toBe(melody.notes.length);
    expect(fixed.events[0].startMs).toBeCloseTo(0);
  });

  it('keeps the median steady when two notes are far off', () => {
    const events = melody.notes.map((note, i) => event(note, i === 2 || i === 5 ? 600 : 100));
    const graded = gradeRecording(melody, events, BPM, { ignoreOctave: false, autoLatency: true });
    expect(graded.medianMs).toBe(100);
    expect(graded.correctionMs).toBe(100);
    expect(graded.meanMs).toBeGreaterThan(100);
  });

  it('applies no correction with fewer than 3 matched notes', () => {
    const events = melody.notes.slice(0, 2).map((note) => event(note, 200));
    const graded = gradeRecording(melody, events, BPM, { ignoreOctave: false, autoLatency: true });
    expect(graded.samples).toBe(2);
    expect(graded.correctionMs).toBe(0);
  });

  it('clamps a large shift', () => {
    const graded = gradeRecording(melody, shifted(400), BPM, { ignoreOctave: false, autoLatency: true });
    expect(graded.medianMs).toBe(400);
    expect(graded.correctionMs).toBe(MAX_CORRECTION_MS);
  });

  it('passes ignoreOctave through', () => {
    const events = melody.notes.map((note) => event(note, 0, 12));
    const strict = gradeRecording(melody, events, BPM, { ignoreOctave: false, autoLatency: true });
    expect(strict.result.reference.every((r) => r.grade === 'red')).toBe(true);
    const loose = gradeRecording(melody, events, BPM, { ignoreOctave: true, autoLatency: true });
    expect(loose.result.reference.every((r) => r.grade === 'green')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { eighthMs, quantize } from './quantize.ts';
import type { NoteEvent } from './segment.ts';

const event = (startMs: number, durationMs: number): NoteEvent => ({
  midi: 60,
  startMs,
  durationMs,
  meanCents: 0,
  frames: 10,
  suspectOctave: 0,
  suspectTwelfth: 0,
  meanClarity: 1,
  meanLevelDb: -20,
});

describe('quantize', () => {
  it('computes the eighth length from the tempo', () => {
    expect(eighthMs(60)).toBe(500);
    expect(eighthMs(100)).toBe(300);
  });

  it('snaps onsets to the nearest eighth at 60 BPM', () => {
    const notes = quantize([event(30, 900), event(740, 500), event(1260, 500)], 60);
    expect(notes.map((n) => n.startEighth)).toEqual([0, 1, 3]);
  });

  it('snaps onsets to the nearest eighth at 100 BPM', () => {
    const notes = quantize([event(140, 300), event(460, 300), event(1190, 600)], 100);
    expect(notes.map((n) => n.startEighth)).toEqual([0, 2, 4]);
  });

  it('rounds durations with a minimum of one eighth', () => {
    const notes = quantize([event(0, 80), event(500, 740), event(1000, 1900)], 60);
    expect(notes.map((n) => n.durationEighths)).toEqual([1, 1, 4]);
  });

  it('drops events played during the count-in', () => {
    const notes = quantize([event(-900, 400), event(-260, 400), event(-240, 400), event(500, 400)], 60);
    expect(notes.map((n) => n.startMs)).toEqual([-240, 500]);
    expect(notes.map((n) => n.startEighth)).toEqual([0, 1]);
  });

  it('keeps the event fields', () => {
    const [note] = quantize([event(0, 1000)], 60);
    expect(note).toMatchObject({ midi: 60, startMs: 0, durationMs: 1000, startEighth: 0, durationEighths: 2 });
  });
});

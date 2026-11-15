import { describe, expect, it } from 'vitest';
import type { CompareResult } from './logic/index.ts';
import {
  accidentalFor,
  eighthsToDuration,
  gradeColour,
  midiToVexKey,
  toStaffBars,
} from './staffModel.ts';

const E3 = 52;
const FS3 = 54;
const G4 = 67;

describe('staffModel', () => {
  it('maps MIDI to VexFlow keys', () => {
    expect(midiToVexKey(E3)).toBe('e/3');
    expect(midiToVexKey(FS3)).toBe('f#/3');
    expect(midiToVexKey(G4)).toBe('g/4');
    expect(accidentalFor(FS3)).toBe('#');
    expect(accidentalFor(G4)).toBeNull();
  });

  it('maps eighths to the nearest renderable duration', () => {
    expect([1, 2, 3, 4, 6, 8].map(eighthsToDuration)).toEqual(['8', 'q', 'qd', 'h', 'hd', 'w']);
    expect(eighthsToDuration(5)).toBe('h');
    expect(eighthsToDuration(12)).toBe('w');
  });

  it('colours notes by grade', () => {
    expect(gradeColour('green')).toBe('#16a34a');
    expect(gradeColour('yellow')).toBe('#ca8a04');
    expect(gradeColour('red')).toBe('#dc2626');
    expect(gradeColour('extra')).toBe('#dc2626');
    expect(gradeColour(null)).toBe('#000000');
  });

  it('splits both staves into bars by onset', () => {
    const ref = (midi: number, startEighth: number) => ({ midi, startEighth, durationEighths: 4 });
    const reference: CompareResult['reference'] = [
      { note: ref(G4, 0), grade: 'green', playedIndex: 0 },
      { note: ref(E3, 4), grade: 'red', playedIndex: null },
      { note: ref(FS3, 8), grade: 'yellow', playedIndex: 1 },
    ];
    const playedNote = (midi: number, startEighth: number) => ({
      midi,
      startEighth,
      durationEighths: 2,
      startMs: 0,
      durationMs: 0,
      meanCents: 0,
      frames: 1,
      suspectOctave: 0,
      suspectTwelfth: 0,
    });
    const played: CompareResult['played'] = [
      { note: playedNote(G4, 0), grade: 'green' },
      { note: playedNote(FS3, 9), grade: 'yellow' },
      { note: playedNote(E3, 17), grade: 'extra' },
    ];
    const bars = toStaffBars(reference, played);
    expect(bars).toHaveLength(3);
    expect(bars[0].reference.map((n) => n.key)).toEqual(['g/4', 'e/3']);
    expect(bars[0].reference[1].colour).toBe('#dc2626');
    expect(bars[1].played).toEqual([{ key: 'f#/3', accidental: '#', duration: 'q', colour: '#ca8a04' }]);
    expect(bars[2].reference).toEqual([]);
    expect(bars[2].played[0].colour).toBe('#dc2626');
  });
});

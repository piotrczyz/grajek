import { describe, expect, it } from 'vitest';
import {
  compare,
  MELODIES,
  melodyLengthEighths,
  type CompareResult,
  type Melody,
  type QuantizedNote,
  type RefNote,
} from './logic/index.ts';
import {
  accidentalFor,
  eighthsToDuration,
  floorDuration,
  gradeColour,
  midiToVexKey,
  referenceBars,
  toAlignedBars,
  type AlignedBar,
  type StaffSlot,
} from './staffModel.ts';

const E3 = 52;
const FS3 = 54;
const G4 = 67;

const melody: Melody = MELODIES.find((m) => m.id === 'panie-janie') as Melody;
const EIGHTHS: Record<string, number> = { '8': 1, q: 2, qd: 3, h: 4, hd: 6, w: 8 };
const lengthOf = (slots: StaffSlot[]) => slots.reduce((sum, s) => sum + EIGHTHS[s.duration], 0);

function play(note: RefNote, overrides: Partial<QuantizedNote> = {}): QuantizedNote {
  return {
    midi: note.midi,
    startMs: 0,
    durationMs: 0,
    meanCents: 0,
    frames: 10,
    suspectOctave: 0,
    suspectTwelfth: 0,
    startEighth: note.startEighth,
    durationEighths: note.durationEighths,
    ...overrides,
  };
}

function aligned(played: QuantizedNote[]): { result: CompareResult; bars: AlignedBar[] } {
  const result = compare(melody, played);
  return { result, bars: toAlignedBars(result, melodyLengthEighths(melody)) };
}

const notesOf = (slots: StaffSlot[] | null) => (slots ?? []).filter((s) => s.kind === 'note');

function expectFullBars(bars: AlignedBar[]) {
  for (const bar of bars) {
    expect(lengthOf(bar.reference)).toBe(8);
    if (bar.played) expect(lengthOf(bar.played)).toBe(8);
  }
}

describe('staffModel', () => {
  it('maps MIDI to VexFlow keys', () => {
    expect(midiToVexKey(E3)).toBe('e/3');
    expect(midiToVexKey(FS3)).toBe('f#/3');
    expect(midiToVexKey(G4)).toBe('g/4');
    expect(accidentalFor(FS3)).toBe('#');
    expect(accidentalFor(G4)).toBeNull();
  });

  it('maps eighths to renderable durations', () => {
    expect([1, 2, 3, 4, 6, 8].map(eighthsToDuration)).toEqual(['8', 'q', 'qd', 'h', 'hd', 'w']);
    expect(eighthsToDuration(5)).toBe('h');
    expect(eighthsToDuration(12)).toBe('w');
    expect([1, 2, 3, 4, 5, 7, 8].map((n) => floorDuration(n)[1])).toEqual(['8', 'q', 'qd', 'h', 'h', 'hd', 'w']);
  });

  it('colours notes by grade, extras grey', () => {
    expect(gradeColour('green')).toBe('#16a34a');
    expect(gradeColour('yellow')).toBe('#ca8a04');
    expect(gradeColour('red')).toBe('#dc2626');
    expect(gradeColour('extra')).toBe('#6b7280');
    expect(gradeColour(null)).toBe('#000000');
  });

  it('draws the reference alone, black, with the current note highlighted', () => {
    const bars = referenceBars(melody, 2);
    expect(bars).toHaveLength(4);
    expectFullBars(bars);
    expect(bars.every((b) => b.played === null)).toBe(true);
    const first = notesOf(bars[0].reference);
    expect(first.map((s) => s.refIndex)).toEqual([0, 1, 2, 3]);
    expect(first.map((s) => s.colour)).toEqual(['#000000', '#000000', '#2563eb', '#000000']);
  });

  it('puts every played note of a perfect performance under its reference note', () => {
    const { bars } = aligned(melody.notes.map((n) => play(n)));
    expect(bars).toHaveLength(4);
    expectFullBars(bars);
    for (const bar of bars) {
      const ref = notesOf(bar.reference);
      const played = notesOf(bar.played);
      expect(played.map((s) => s.startEighth)).toEqual(ref.map((s) => s.startEighth));
      expect(played.map((s) => s.duration)).toEqual(ref.map((s) => s.duration));
      expect(played.every((s) => s.colour === '#16a34a')).toBe(true);
    }
  });

  it('places a note one eighth late one eighth later, under the reference slot', () => {
    const played = melody.notes.map((n, i) =>
      i === 1 ? play(n, { startEighth: n.startEighth + 1, durationEighths: 1 }) : play(n),
    );
    const { bars } = aligned(played);
    expectFullBars(bars);
    const late = bars[0].played!.find((s) => s.playedIndex === 1)!;
    expect(late).toMatchObject({ kind: 'note', startEighth: 3, duration: '8', colour: '#ca8a04' });
    expect(bars[0].reference.find((s) => s.refIndex === 1)!.startEighth).toBe(2);
    // The eighth before it stays empty in the played row.
    expect(bars[0].played!.find((s) => s.startEighth === 2)).toMatchObject({ kind: 'rest' });
  });

  it('shows a missing note as a red rest at its onset', () => {
    const played = melody.notes.filter((_, i) => i !== 2).map((n) => play(n));
    const { bars } = aligned(played);
    expectFullBars(bars);
    const rest = bars[0].played!.find((s) => s.startEighth === 4)!;
    expect(rest).toMatchObject({ kind: 'rest', colour: '#dc2626', refIndex: 2, duration: 'q' });
    expect(bars[0].reference.find((s) => s.refIndex === 2)!.colour).toBe('#dc2626');
  });

  it('draws an extra note grey, in an extra bar with a whole rest above', () => {
    const played = [...melody.notes.map((n) => play(n)), play(melody.notes[0], { midi: E3, startEighth: 33 })];
    const { bars } = aligned(played);
    expect(bars).toHaveLength(5);
    expectFullBars(bars);
    expect(bars[4].reference).toEqual([expect.objectContaining({ kind: 'rest', duration: 'w' })]);
    expect(notesOf(bars[4].played)).toEqual([
      expect.objectContaining({ key: 'e/3', colour: '#6b7280', startEighth: 33, playedIndex: 14 }),
    ]);
  });

  it('clips a played note to the next onset and keeps one note per eighth', () => {
    const played = melody.notes.map((n, i) => (i === 0 ? play(n, { durationEighths: 4 }) : play(n)));
    played.push(play(melody.notes[5], { midi: FS3, startEighth: 2 }));
    const { result, bars } = aligned(played);
    expectFullBars(bars);
    const first = notesOf(bars[0].played);
    expect(first[0]).toMatchObject({ startEighth: 0, duration: 'q', playedIndex: 0 });
    // The matched note wins over the extra one on eighth 2.
    expect(first[1].playedIndex).toBe(1);
    expect(result.played[14].grade).toBe('extra');
  });

  it('splits a note too long for one value into a note and a rest', () => {
    // C4 held for 5 eighths over the missing D4 and E4: a half note and an eighth rest.
    const played = melody.notes
      .map((n, i) => (i === 0 ? play(n, { durationEighths: 5 }) : play(n)))
      .filter((_, i) => i !== 1 && i !== 2);
    const { bars } = aligned(played);
    expectFullBars(bars);
    const row = bars[0].played!;
    expect(row[0]).toMatchObject({ kind: 'note', startEighth: 0, duration: 'h' });
    // The missing notes start under the sustained note: no red rest for them.
    expect(row[1]).toMatchObject({ kind: 'rest', startEighth: 4, duration: '8', colour: '#9ca3af' });
  });
});

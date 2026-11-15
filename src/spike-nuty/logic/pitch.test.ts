import { describe, expect, it } from 'vitest';
import {
  hzToMidiFloat,
  hzToNote,
  midiToHz,
  midiToName,
  pitchClass,
  soundingToWritten,
  TRANSPOSITION,
  writtenToSounding,
} from './pitch.ts';

describe('hzToNote', () => {
  it('reads 440 Hz as A4 with 0 cents', () => {
    expect(hzToNote(440)).toEqual({ midi: 69, name: 'A4', cents: 0 });
  });

  it('reads 261.63 Hz as C4', () => {
    const note = hzToNote(261.63);
    expect(note?.name).toBe('C4');
    expect(note?.midi).toBe(60);
    expect(Math.abs(note?.cents ?? 99)).toBeLessThanOrEqual(1);
  });

  it('reads 452 Hz as A4 about +46 cents', () => {
    const note = hzToNote(452);
    expect(note?.name).toBe('A4');
    expect(note?.cents).toBeGreaterThanOrEqual(45);
    expect(note?.cents).toBeLessThanOrEqual(48);
  });

  it('returns null for invalid frequencies', () => {
    expect(hzToNote(0)).toBeNull();
    expect(hzToNote(-100)).toBeNull();
    expect(hzToNote(Number.NaN)).toBeNull();
    expect(hzToNote(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('transposition', () => {
  it('maps 147 Hz sounding to D3, written E3 on a B-flat clarinet', () => {
    const sounding = hzToNote(147);
    expect(sounding?.name).toBe('D3');
    const written = soundingToWritten(sounding?.midi ?? 0, 'clarinet-bb');
    expect(midiToName(written)).toBe('E3');
    expect(writtenToSounding(written, 'clarinet-bb')).toBe(sounding?.midi);
  });

  it('leaves pitch unchanged for a C instrument', () => {
    expect(TRANSPOSITION.c).toBe(0);
    expect(soundingToWritten(62, 'c')).toBe(62);
    expect(writtenToSounding(62, 'c')).toBe(62);
  });
});

describe('naming helpers', () => {
  it('names notes with sharps and octave numbers', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(54)).toBe('F#3');
    expect(midiToName(58)).toBe('A#3');
    expect(midiToName(71)).toBe('B4');
  });

  it('converts MIDI to Hz and back', () => {
    expect(midiToHz(69)).toBe(440);
    expect(hzToMidiFloat(midiToHz(52))).toBeCloseTo(52, 10);
  });

  it('gives the pitch class', () => {
    expect(pitchClass(60)).toBe(0);
    expect(pitchClass(52)).toBe(4);
    expect(pitchClass(-1)).toBe(11);
  });
});

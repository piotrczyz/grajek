import { describe, expect, it } from 'vitest';
import { midiToHz } from './pitch.ts';
import { DEFAULT_SEGMENT_OPTIONS, segment, type PitchFrame } from './segment.ts';

const STEP = 20;

/** Frames every 20 ms in [fromMs, toMs). */
function tone(midi: number | null, fromMs: number, toMs: number, levelDb = -20, clarity = 0.97): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let t = fromMs; t < toMs; t += STEP) {
    frames.push({ timeMs: t, hz: midi === null ? null : midiToHz(midi), clarity: midi === null ? 0.2 : clarity, levelDb: midi === null ? -70 : levelDb });
  }
  return frames;
}

const silence = (fromMs: number, toMs: number) => tone(null, fromMs, toMs);

describe('segment', () => {
  it('uses the planned defaults', () => {
    expect(DEFAULT_SEGMENT_OPTIONS).toEqual({
      minClarity: 0.9,
      minLevelDb: -50,
      minNoteMs: 80,
      stableMs: 60,
      reattackDb: 6,
      ignoreWindows: [],
    });
  });

  it('splits a clean sequence of steady tones into events with correct starts', () => {
    const frames = [
      ...silence(0, 100),
      ...tone(60, 100, 600),
      ...tone(62, 600, 1100),
      ...silence(1100, 1200),
      ...tone(64, 1200, 2000),
      ...silence(2000, 2200),
    ];
    const events = segment(frames);
    expect(events.map((e) => e.midi)).toEqual([60, 62, 64]);
    const expectedStarts = [100, 600, 1200];
    events.forEach((event, i) => {
      expect(Math.abs(event.startMs - expectedStarts[i])).toBeLessThanOrEqual(STEP);
    });
    expect(Math.abs(events[0].durationMs - 500)).toBeLessThanOrEqual(STEP);
    expect(Math.abs(events[2].durationMs - 800)).toBeLessThanOrEqual(STEP);
    expect(events.every((e) => e.suspectOctave === 0 && e.suspectTwelfth === 0)).toBe(true);
    expect(events[0].meanCents).toBe(0);
  });

  it('gives two events for a repeated pitch separated by a level dip', () => {
    const frames = [...tone(62, 0, 400), ...tone(62, 400, 460, -34), ...tone(62, 460, 900)];
    const events = segment(frames);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.midi)).toEqual([62, 62]);
    expect(Math.abs(events[1].startMs - 460)).toBeLessThanOrEqual(STEP);
  });

  it('gives two events for a repeated pitch separated by a short silence with a re-attack', () => {
    const frames = [...tone(62, 0, 400), ...silence(400, 440), ...tone(62, 440, 900)];
    const events = segment(frames);
    expect(events).toHaveLength(2);
    expect(Math.abs(events[1].startMs - 440)).toBeLessThanOrEqual(STEP);
  });

  it('bridges a one-frame clarity dropout at a steady level', () => {
    const frames = [...tone(62, 0, 300), ...tone(62, 300, 320, -20, 0.5), ...tone(62, 320, 700)];
    const events = segment(frames);
    expect(events).toHaveLength(1);
    expect(events[0].startMs).toBe(0);
  });

  it('does not create an event from frames inside an ignore window', () => {
    const frames = [...silence(0, 1000), ...tone(81, 1000, 1100), ...silence(1100, 2000)];
    expect(segment(frames, { minNoteMs: 40 })).toHaveLength(1);
    expect(segment(frames, { minNoteMs: 40, ignoreWindows: [[990, 1110]] })).toHaveLength(0);
  });

  it('does not end a sounding note on frames inside an ignore window', () => {
    const frames = [...tone(60, 0, 500), ...silence(500, 580), ...tone(60, 580, 1000)];
    const events = segment(frames, { ignoreWindows: [[490, 590]] });
    expect(events).toHaveLength(1);
    expect(events[0].startMs).toBe(0);
  });

  it('keeps a 2-frame octave jump inside a note and counts it in suspectOctave', () => {
    const frames = [...tone(60, 0, 300), ...tone(72, 300, 340), ...tone(60, 340, 700)];
    const events = segment(frames);
    expect(events).toHaveLength(1);
    expect(events[0].midi).toBe(60);
    expect(events[0].suspectOctave).toBe(2);
    expect(events[0].suspectTwelfth).toBe(0);
  });

  it('counts a twelfth glitch in suspectTwelfth', () => {
    const frames = [...tone(52, 0, 300), ...tone(71, 300, 320), ...tone(52, 320, 700)];
    const events = segment(frames);
    expect(events).toHaveLength(1);
    expect(events[0].suspectTwelfth).toBe(1);
  });

  it('reports the rounded mean clarity and level of the voiced frames', () => {
    const frames = [...tone(60, 0, 200, -20, 0.95), ...tone(60, 200, 400, -25, 0.9), ...silence(400, 600)];
    const events = segment(frames);
    expect(events).toHaveLength(1);
    expect(events[0].meanClarity).toBe(0.925);
    expect(events[0].meanLevelDb).toBe(-22.5);
  });

  it('drops events shorter than minNoteMs', () => {
    const frames = [...tone(60, 0, 400), ...silence(400, 600), ...tone(64, 600, 660), ...silence(660, 900)];
    const events = segment(frames);
    expect(events).toHaveLength(1);
    expect(events[0].midi).toBe(60);
  });

  it('ignores frames below the clarity or level gate', () => {
    expect(segment(tone(60, 0, 500, -20, 0.5))).toHaveLength(0);
    expect(segment(tone(60, 0, 500, -60))).toHaveLength(0);
  });
});

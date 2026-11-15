import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMetronome, START_DELAY_SEC, startTimes } from './metronome.ts';

afterEach(() => {
  vi.useRealTimers();
});

/** Just enough of an AudioContext to record when clicks are scheduled. */
function fakeContext() {
  const starts: number[] = [];
  const node = () => ({ connect: (next: unknown) => next });
  const ctx = {
    currentTime: 10,
    sampleRate: 1000,
    destination: {},
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ ...node(), buffer: null, start: (t: number) => starts.push(t) }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: { value: 0 }, Q: { value: 0 } }),
    createGain: () => ({ ...node(), gain: { value: 0 } }),
  };
  return { ctx: ctx as unknown as AudioContext, starts, raw: ctx };
}

describe('startTimes', () => {
  it('puts the first click after the start delay and the lead-in', () => {
    expect(startTimes(10, 60, 4)).toEqual({ firstBeatSec: 10 + START_DELAY_SEC, downbeatSec: 14 + START_DELAY_SEC });
    const withLeadIn = startTimes(10, 120, 4, 5);
    expect(withLeadIn.firstBeatSec).toBeCloseTo(15 + START_DELAY_SEC);
    expect(withLeadIn.downbeatSec).toBeCloseTo(17 + START_DELAY_SEC);
  });
});

describe('createMetronome', () => {
  it('schedules the first count-in click after the lead-in', () => {
    vi.useFakeTimers();
    const { ctx, starts, raw } = fakeContext();
    const metronome = createMetronome(ctx, { bpm: 60, beatsPerBar: 4, silentAfterCountIn: false });
    const downbeat = metronome.start(5);
    expect(downbeat).toBeCloseTo(10 + START_DELAY_SEC + 5 + 4);
    expect(starts).toEqual([]);
    raw.currentTime = 15.1;
    vi.advanceTimersByTime(30);
    expect(starts[0]).toBeCloseTo(10 + START_DELAY_SEC + 5);
    metronome.stop();
  });
});

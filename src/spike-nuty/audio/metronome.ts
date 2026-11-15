// Metronome on the AudioContext clock with look-ahead scheduling: one bar of
// count-in (accent on beat 1), then clicks for as long as it runs. The click
// is a ~15 ms band-passed noise burst, so it has no stable pitch for the
// detector. Click times are exposed (ms relative to the downbeat after the
// count-in) so the segmenter can ignore them.

export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: 4;
  /** Silence the clicks after the count-in (visual-only metronome). */
  silentAfterCountIn: boolean;
}

/** `bar` is 0 during the count-in and 1.. afterwards; `beat` is 1..beatsPerBar. */
export type BeatListener = (bar: number, beat: number, isCountIn: boolean) => void;

export interface Metronome {
  /**
   * Starts the count-in after an optional lead-in (seconds of silence to get
   * ready); returns the downbeat time after the count-in, in ctx seconds.
   */
  start(leadInSec?: number): number;
  stop(): void;
  /** Audible click times in ms relative to the downbeat. */
  clickTimesMs(): number[];
  onBeat(cb: BeatListener): void;
}

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 25;
export const START_DELAY_SEC = 0.15;
const CLICK_SEC = 0.015;

/** First count-in click and the downbeat after the count-in, in ctx seconds. */
export function startTimes(
  nowSec: number,
  bpm: number,
  beatsPerBar: number,
  leadInSec = 0,
): { firstBeatSec: number; downbeatSec: number } {
  const firstBeatSec = nowSec + START_DELAY_SEC + Math.max(0, leadInSec);
  return { firstBeatSec, downbeatSec: firstBeatSec + beatsPerBar * (60 / bpm) };
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * CLICK_SEC);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const fade = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  return buffer;
}

export function createMetronome(ctx: AudioContext, options: MetronomeOptions): Metronome {
  const beatSec = 60 / options.bpm;
  const listeners: BeatListener[] = [];
  const clicks: number[] = [];
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let interval: ReturnType<typeof setInterval> | null = null;
  let firstBeatSec = 0;
  let downbeatSec = 0;
  let nextBeat = 0;
  let buffer: AudioBuffer | null = null;

  const click = (timeSec: number, accent: boolean) => {
    buffer ??= noiseBuffer(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = accent ? 3500 : 2200;
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = accent ? 1 : 0.6;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(timeSec);
  };

  const schedule = () => {
    while (firstBeatSec + nextBeat * beatSec < ctx.currentTime + LOOKAHEAD_SEC) {
      const index = nextBeat;
      const timeSec = firstBeatSec + index * beatSec;
      const isCountIn = index < options.beatsPerBar;
      const beat = (index % options.beatsPerBar) + 1;
      const bar = Math.floor(index / options.beatsPerBar);
      if (isCountIn || !options.silentAfterCountIn) {
        click(timeSec, beat === 1);
        clicks.push((timeSec - downbeatSec) * 1000);
      }
      const delayMs = Math.max(0, (timeSec - ctx.currentTime) * 1000);
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        for (const listener of listeners) listener(bar, beat, isCountIn);
      }, delayMs);
      timeouts.add(timeout);
      nextBeat += 1;
    }
  };

  return {
    start(leadInSec = 0) {
      ({ firstBeatSec, downbeatSec } = startTimes(ctx.currentTime, options.bpm, options.beatsPerBar, leadInSec));
      nextBeat = 0;
      clicks.length = 0;
      schedule();
      interval = setInterval(schedule, TICK_MS);
      return downbeatSec;
    },
    stop() {
      if (interval !== null) clearInterval(interval);
      interval = null;
      for (const timeout of timeouts) clearTimeout(timeout);
      timeouts.clear();
    },
    clickTimesMs() {
      return [...clicks];
    },
    onBeat(cb) {
      listeners.push(cb);
    },
  };
}

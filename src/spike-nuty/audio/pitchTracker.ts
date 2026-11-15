// Polls an AnalyserNode about every 20 ms and turns each window into a
// PitchFrame with pitchy (McLeod Pitch Method). Times are on the AudioContext
// clock, relative to the downbeat after the count-in, taken at the centre of
// the analysed window and corrected by the output latency (the player hears a
// click that much later than it is scheduled).
import { PitchDetector } from 'pitchy';
import type { PitchFrame } from '../logic/index.ts';

const FFT_SIZE = 2048;
const POLL_MS = 20;
const SILENCE_DB = -100;

export interface PitchTracker {
  frames(): PitchFrame[];
  latest(): PitchFrame | null;
  stop(): void;
  /** Latency compensation applied to every frame, ms (shown in diagnostics). */
  latencyMs: number;
}

export function createPitchTracker(
  ctx: AudioContext,
  source: AudioNode,
  downbeatSec: number,
): PitchTracker {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  const buffer = new Float32Array(FFT_SIZE);
  const detector = PitchDetector.forFloat32Array(FFT_SIZE);
  const halfWindowMs = (FFT_SIZE / 2 / ctx.sampleRate) * 1000;
  const latencyMs = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
  const frames: PitchFrame[] = [];
  let last: PitchFrame | null = null;

  const poll = () => {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    const levelDb = rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
    const [hz, clarity] = detector.findPitch(buffer, ctx.sampleRate);
    const frame: PitchFrame = {
      timeMs: (ctx.currentTime - downbeatSec) * 1000 - halfWindowMs - latencyMs,
      hz: Number.isFinite(hz) && hz > 0 ? hz : null,
      clarity: Number.isFinite(clarity) ? clarity : 0,
      levelDb,
    };
    frames.push(frame);
    last = frame;
  };

  const interval = setInterval(poll, POLL_MS);

  return {
    frames: () => [...frames],
    latest: () => last,
    stop() {
      clearInterval(interval);
      source.disconnect(analyser);
    },
    latencyMs,
  };
}

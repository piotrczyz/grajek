// Quantization: snap note events to the eighth-note grid of the tempo.

import type { NoteEvent } from './segment.ts';

export type QuantizedNote = NoteEvent & { startEighth: number; durationEighths: number };

export function eighthMs(bpm: number): number {
  return 30000 / bpm;
}

/** Events starting more than half an eighth before the downbeat (count-in) are dropped. */
export function quantize(events: NoteEvent[], bpm: number): QuantizedNote[] {
  const eighth = eighthMs(bpm);
  return events
    .filter((event) => event.startMs >= -eighth / 2)
    .map((event) => ({
      ...event,
      startEighth: Math.max(0, Math.round(event.startMs / eighth)),
      durationEighths: Math.max(1, Math.round(event.durationMs / eighth)),
    }));
}

// Pitch maths for the "Zagraj i sprawdź" spike: Hz <-> MIDI, note names and
// transposition between sounding and written pitch. A4 = 440 Hz = MIDI 69.

const A4_HZ = 440;
const A4_MIDI = 69;

/** Scientific pitch names with sharps and international letters (B, not H). */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface NoteReading {
  midi: number;
  name: string;
  /** Distance from the nearest note in cents, -50..+50. */
  cents: number;
}

export type Instrument = 'clarinet-bb' | 'c';

/** Semitones added to sounding pitch to get written pitch. */
export const TRANSPOSITION: Record<Instrument, number> = { 'clarinet-bb': 2, c: 0 };

export function hzToMidiFloat(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

export function hzToNote(hz: number): NoteReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const exact = hzToMidiFloat(hz);
  const midi = Math.round(exact);
  return { midi, name: midiToName(midi), cents: Math.round((exact - midi) * 100) };
}

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[pitchClass(midi)]}${octave}`;
}

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export function soundingToWritten(midi: number, instrument: Instrument): number {
  return midi + TRANSPOSITION[instrument];
}

export function writtenToSounding(midi: number, instrument: Instrument): number {
  return midi - TRANSPOSITION[instrument];
}

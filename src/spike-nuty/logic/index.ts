export {
  hzToMidiFloat,
  hzToNote,
  midiToHz,
  midiToName,
  pitchClass,
  soundingToWritten,
  TRANSPOSITION,
  writtenToSounding,
  type Instrument,
  type NoteReading,
} from './pitch.ts';
export { MELODIES, melodyLengthEighths, type Melody, type RefNote } from './melodies.ts';
export {
  DEFAULT_SEGMENT_OPTIONS,
  segment,
  type NoteEvent,
  type PitchFrame,
  type SegmentOptions,
} from './segment.ts';
export { eighthMs, quantize, type QuantizedNote } from './quantize.ts';
export {
  compare,
  DEFAULT_COMPARE_OPTIONS,
  type CompareOptions,
  type CompareResult,
  type NoteGrade,
} from './compare.ts';

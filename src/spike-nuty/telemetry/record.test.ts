import { describe, expect, it } from 'vitest';
// The server's own parser: the record built here must pass it unchanged.
import { parseAttempt } from '../../../functions/src/spike-nuty/validation.ts';
import { estimateRecognition, HEURISTIC_VERSION } from '../../../functions/src/spike-nuty/recognition-estimate.ts';
import { gradeRecording, MELODIES, type Melody, type NoteEvent, type PitchFrame } from '../logic/index.ts';
import {
  attemptDetails,
  buildAttemptRecord,
  MAX_EVENTS,
  readTelemetryEnv,
  type BuildAttemptInput,
} from './record.ts';

const melody: Melody = MELODIES.find((m) => m.id === 'panie-janie') as Melody;
const BPM = 60;
const EIGHTH = 500;
const DEVICE_ID = '0b9f8c2e-4d1a-4c3b-9e8f-1a2b3c4d5e6f';

function event(midi: number, startMs: number, durationMs: number, overrides: Partial<NoteEvent> = {}): NoteEvent {
  return {
    midi,
    startMs,
    durationMs,
    meanCents: 3,
    frames: 20,
    suspectOctave: 0,
    suspectTwelfth: 0,
    meanClarity: 0.95,
    meanLevelDb: -21.5,
    ...overrides,
  };
}

/** Panie Janie played in tune (written = sounding with the C instrument), note 2 an octave high, note 3 a twelfth high. */
function played(): NoteEvent[] {
  return melody.notes.map((note, i) =>
    event(note.midi + (i === 1 ? 12 : i === 2 ? 19 : 0), note.startEighth * EIGHTH + 30, note.durationEighths * EIGHTH),
  );
}

function input(overrides: Partial<BuildAttemptInput> = {}): BuildAttemptInput {
  const events = played();
  return {
    deviceId: DEVICE_ID,
    now: 1_763_200_000_000,
    settings: {
      melodyId: melody.id,
      instrument: 'c',
      bpm: 75,
      prepSec: 5,
      ignoreOctave: false,
      visualOnly: false,
      autoLatency: true,
    },
    recording: { events, bpm: BPM },
    graded: gradeRecording(melody, events, BPM, { ignoreOctave: false, autoLatency: true }),
    latencyMs: 42.37,
    ended: 'complete',
    env: { userAgent: 'Mozilla/5.0 (test)', standalone: true, platform: 'Android', mobile: true },
    build: 'abc1234',
    ...overrides,
  };
}

describe('buildAttemptRecord', () => {
  it('builds a v1 record the server parser accepts unchanged', () => {
    const record = buildAttemptRecord(input());
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(record).toMatchObject({
      v: 1,
      deviceId: DEVICE_ID,
      clientTs: 1_763_200_000_000,
      app: { build: 'abc1234' },
      device: { userAgent: 'Mozilla/5.0 (test)', standalone: true, platform: 'Android', mobile: true },
      ended: 'complete',
    });
  });

  it('takes the tempo the recording was made at, not the slider', () => {
    expect(buildAttemptRecord(input()).settings.bpm).toBe(BPM);
  });

  it('copies scores, counts and timing from the grading', () => {
    const data = input();
    const record = buildAttemptRecord(data);
    expect(record.result.scorePercent).toBe(data.graded.result.scorePercent);
    expect(record.result.counts.total).toBe(melody.notes.length);
    expect(record.timing).toMatchObject({
      outputLatencyMs: 42.4,
      correctionMs: data.graded.correctionMs,
      samples: data.graded.samples,
    });
  });

  it('grades note by note with machine-readable statuses and octave/twelfth flags', () => {
    const record = buildAttemptRecord(input());
    expect(record.notes).toHaveLength(melody.notes.length);
    expect(record.notes[0]).toMatchObject({ nr: 1, refIndex: 0, status: 'good', octaveOff: false, twelfthOff: false });
    expect(record.notes[1]).toMatchObject({ status: 'wrongPitch', octaveOff: true, twelfthOff: false });
    expect(record.notes[1].playedMidi! - record.notes[1].expectedMidi!).toBe(12);
    expect(record.notes[2]).toMatchObject({ status: 'wrongPitch', octaveOff: false, twelfthOff: true });
  });

  it('sends the raw sounding events, before the latency shift', () => {
    const data = input();
    const record = buildAttemptRecord(data);
    expect(data.graded.correctionMs).not.toBe(0);
    expect(record.events[0]).toEqual({
      midi: data.recording.events[0].midi,
      startMs: data.recording.events[0].startMs,
      durationMs: data.recording.events[0].durationMs,
      meanCents: 3,
      meanClarity: 0.95,
      meanLevelDb: -21.5,
      frames: 20,
      suspectOctave: 0,
      suspectTwelfth: 0,
    });
  });

  it('caps the events at 200 and the user agent at 512 characters, still accepted by the server', () => {
    const many = Array.from({ length: 250 }, (_, i) => event(60, i * 100, 80));
    const record = buildAttemptRecord(
      input({
        recording: { events: many, bpm: BPM },
        env: { userAgent: 'x'.repeat(600), standalone: false },
      }),
    );
    expect(record.events).toHaveLength(MAX_EVENTS);
    expect(record.device.userAgent).toHaveLength(512);
    expect(record.device).not.toHaveProperty('platform');
    expect(record.device).not.toHaveProperty('mobile');
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('keeps out-of-range values inside the server bounds', () => {
    const odd = [event(140, 0, 500, { meanClarity: 1.2, meanCents: Number.NaN })];
    const record = buildAttemptRecord(
      input({ recording: { events: odd, bpm: 400 }, latencyMs: Number.POSITIVE_INFINITY, settings: { ...input().settings, prepSec: 90 } }),
    );
    expect(record.events[0]).toMatchObject({ midi: 127, meanClarity: 1, meanCents: 0 });
    expect(record.settings).toMatchObject({ bpm: 300, prepSec: 60 });
    expect(record.timing.outputLatencyMs).toBeNull();
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('has no name, profile or audio field', () => {
    const json = JSON.stringify(buildAttemptRecord(input()));
    expect(json).not.toMatch(/"(name|profile|profileId|audio)"/);
  });
});

/** Frames every 20 ms: loud and voiced where the events sound, quiet and unvoiced elsewhere. */
function framesOf(events: NoteEvent[], endMs: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let t = 0; t < endMs; t += 20) {
    const sounding = events.some((e) => t >= e.startMs && t < e.startMs + e.durationMs);
    frames.push(
      sounding ? { timeMs: t, hz: 440, clarity: 0.96, levelDb: -20 } : { timeMs: t, hz: null, clarity: 0.1, levelDb: -80 },
    );
  }
  return frames;
}

describe('buildAttemptRecord: raw signals and the recognition estimate', () => {
  function withFrames(events: NoteEvent[] = played()): BuildAttemptInput {
    const end = melody.notes.at(-1)!;
    const frames = framesOf(events, (end.startEighth + end.durationEighths) * EIGHTH);
    return input({ recording: { events, bpm: BPM, frames } });
  }

  it('fills the event pitch spread, the note window levels and the attempt signal', () => {
    const events = played().map((e, i) => ({ ...e, pitchSpreadCents: i === 0 ? 12.4 : 3000 }));
    const data = withFrames(events);
    const record = buildAttemptRecord(data);
    expect(record.events[0].pitchSpreadCents).toBe(12);
    // Clamped to the server bound.
    expect(record.events[1].pitchSpreadCents).toBe(2400);
    // Every reference window is mostly sounding (-20 dB) with the gaps (-80 dB) in between.
    for (const note of record.notes) {
      expect(note.windowLevelDb).toBeGreaterThan(-80);
      expect(note.windowLevelDb).toBeLessThan(-19);
    }
    const frames = data.recording.frames!;
    expect(record.signal).toEqual({
      frames: frames.length,
      voicedFrames: frames.filter((f) => f.hz !== null).length,
      medianClarity: 0.96,
    });
  });

  it('stores the estimate with the heuristic version, and the server parser accepts the record', () => {
    const record = buildAttemptRecord(withFrames());
    expect(record.estimate?.heuristicVersion).toBe(HEURISTIC_VERSION);
    expect(record.estimate?.notes).toHaveLength(record.notes.length);
    expect(record.estimate?.events).toHaveLength(record.events.length);
    // Note 2 an octave high, note 3 a twelfth high: both suspected recognition errors.
    expect(record.estimate?.notes[1]).toEqual({ verdict: 'recognition', reasons: ['octaveJump'] });
    expect(record.estimate?.notes[2]).toEqual({ verdict: 'recognition', reasons: ['twelfthJump'] });
    expect(record.estimate?.reasons).toMatchObject({ octaveJump: 1, twelfthJump: 1 });
    const refs = melody.notes.length;
    expect(record.estimate?.estimatedAccuracy).toBe(Math.round((1 - 2 / refs) * 1000) / 1000);
    expect(record.estimate?.signals).toMatchObject({ stopped: false });
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('builds a record without frames: no signal, no window levels, still an estimate', () => {
    const record = buildAttemptRecord(input());
    expect(record).not.toHaveProperty('signal');
    expect(record.notes[0]).not.toHaveProperty('windowLevelDb');
    expect(record.estimate?.signals.unvoicedRatio).toBeNull();
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('computes the estimate of a recording over 200 events from the full event list', () => {
    // 250 short low-clarity events: every one is a suspected recognition error.
    const many = Array.from({ length: 250 }, (_, i) => event(60, i * 100, 80, { meanClarity: 0.5 }));
    const data = input({ recording: { events: many, bpm: BPM } });
    const record = buildAttemptRecord(data);
    expect(record.events).toHaveLength(MAX_EVENTS);
    expect(record.estimate?.events).toHaveLength(MAX_EVENTS);
    const counts = record.estimate!.eventCounts;
    expect(counts.player + counts.recognition + counts.uncertain + counts.ok).toBe(250);
    // The note verdicts are those of the full lists, not of the capped ones.
    const full = attemptDetails(data);
    expect(full.events).toHaveLength(250);
    expect(record.estimate?.notes).toEqual(
      estimateRecognition({ notes: full.notes, events: full.events, ended: 'complete' }).notes,
    );
    expect(parseAttempt(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });
});

describe('readTelemetryEnv', () => {
  it('reads the user agent and the standalone mode from the browser', () => {
    const env = readTelemetryEnv();
    expect(env.userAgent).toBe(navigator.userAgent);
    expect(typeof env.standalone).toBe('boolean');
  });
});

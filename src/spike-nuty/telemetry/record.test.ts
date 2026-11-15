import { describe, expect, it } from 'vitest';
// The server's own parser: the record built here must pass it unchanged.
import { parseAttempt } from '../../../functions/src/spike-nuty/validation.ts';
import { gradeRecording, MELODIES, type Melody, type NoteEvent } from '../logic/index.ts';
import { buildAttemptRecord, MAX_EVENTS, readTelemetryEnv, type BuildAttemptInput } from './record.ts';

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

describe('readTelemetryEnv', () => {
  it('reads the user agent and the standalone mode from the browser', () => {
    const env = readTelemetryEnv();
    expect(env.userAgent).toBe(navigator.userAgent);
    expect(typeof env.standalone).toBe('boolean');
  });
});

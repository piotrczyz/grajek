import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  estimateRecognition,
  HEURISTIC_VERSION,
  HIGH_LEVEL_DB,
  LOW_CLARITY,
  LOW_LEVEL_DB,
  MAX_ITEM_REASONS,
  ON_TIME_MS,
  PITCH_SPREAD_CENTS,
  REASON_CODES,
  RHYTHM_OFFSET_MS,
  SHORT_EVENT_MS,
  VERDICTS,
  type EstimateEvent,
  type EstimateInput,
  type EstimateNote,
} from '../src/spike-nuty/recognition-estimate.js';
import { sampleAttempt } from './spike-nuty-fakes.js';

/** A matched reference note graded good, linked to event `i`. */
function ref(i: number, overrides: Partial<EstimateNote> = {}): EstimateNote {
  return {
    refIndex: i,
    playedIndex: i,
    expectedMidi: 67,
    playedMidi: 67,
    offsetMs: 10,
    status: 'good',
    octaveOff: false,
    twelfthOff: false,
    ...overrides,
  };
}

function missing(refIndex: number, overrides: Partial<EstimateNote> = {}): EstimateNote {
  return ref(refIndex, { playedIndex: null, playedMidi: null, offsetMs: null, status: 'missing', ...overrides });
}

function extra(playedIndex: number, playedMidi: number): EstimateNote {
  return ref(0, { refIndex: null, playedIndex, expectedMidi: null, playedMidi, offsetMs: null, status: 'extra' });
}

/** A long, clear, loud, stable event. */
function ev(overrides: Partial<EstimateEvent> = {}): EstimateEvent {
  return { durationMs: 400, meanClarity: 0.95, meanLevelDb: -20, pitchSpreadCents: 10, ...overrides };
}

function input(notes: EstimateNote[], events: EstimateEvent[], extraFields: Partial<EstimateInput> = {}): EstimateInput {
  return { notes, events, ended: 'complete', ...extraFields };
}

/** One wrong-pitch note (67 expected) linked to one event. */
function single(note: Partial<EstimateNote>, event: Partial<EstimateEvent> = {}) {
  return estimateRecognition(input([ref(0, { status: 'wrongPitch', playedMidi: 69, ...note })], [ev(event)]));
}

describe('estimateRecognition: likely recognition errors', () => {
  it.each([
    ['octave up', 79],
    ['octave down', 55],
    ['two octaves up', 91],
    ['two octaves down', 43],
  ])('flags an exact %s as octaveJump', (_name, playedMidi) => {
    expect(single({ playedMidi }).notes[0]).toEqual({ verdict: 'recognition', reasons: ['octaveJump'] });
  });

  it('flags the octaveOff flag as octaveJump', () => {
    expect(single({ playedMidi: 69, octaveOff: true }).notes[0].reasons).toEqual(['octaveJump']);
  });

  it('flags a twelfth up (+19) as twelfthJump, but not a twelfth down', () => {
    expect(single({ playedMidi: 86 }).notes[0]).toEqual({ verdict: 'recognition', reasons: ['twelfthJump'] });
    expect(single({ playedMidi: 48 }).notes[0].reasons).not.toContain('twelfthJump');
  });

  it('flags a very short event as shortEvent', () => {
    expect(single({}, { durationMs: SHORT_EVENT_MS - 1 }).notes[0]).toEqual({
      verdict: 'recognition',
      reasons: ['shortEvent'],
    });
    expect(single({}, { durationMs: SHORT_EVENT_MS }).notes[0].verdict).toBe('player');
  });

  it('flags low clarity and low level', () => {
    expect(single({}, { meanClarity: LOW_CLARITY - 0.01 }).notes[0].reasons).toEqual(['lowClarity']);
    expect(single({}, { meanLevelDb: LOW_LEVEL_DB - 1 }).notes[0].reasons).toEqual(['lowLevel']);
  });

  it('flags a high pitch spread within the event as unstablePitch', () => {
    expect(single({}, { pitchSpreadCents: PITCH_SPREAD_CENTS + 1 }).notes[0]).toEqual({
      verdict: 'recognition',
      reasons: ['unstablePitch'],
    });
  });

  it('flags one reference note split into several same-pitch events as splitNote', () => {
    const result = estimateRecognition(
      input(
        [ref(0, { status: 'rhythm' }), extra(1, 67), extra(2, 67), ref(1, { playedIndex: 3, expectedMidi: 69, playedMidi: 69 })],
        [ev(), ev(), ev(), ev()],
      ),
    );
    expect(result.notes.map((n) => n.verdict)).toEqual(['recognition', 'recognition', 'recognition', 'ok']);
    expect(result.notes[0].reasons).toEqual(['splitNote']);
    expect(result.notes[1].reasons).toEqual(['splitNote']);
    expect(result.notes[2].reasons).toEqual(['splitNote']);
  });

  it('does not flag an extra note of another pitch as splitNote', () => {
    const result = estimateRecognition(input([ref(0, { status: 'rhythm' }), extra(1, 72)], [ev(), ev()]));
    expect(result.notes[1]).toEqual({ verdict: 'uncertain', reasons: [] });
  });

  it('flags a missing repeated reference note next to a played one as mergedNotes', () => {
    const result = estimateRecognition(input([ref(0), missing(1)], [ev({ durationMs: 800 })]));
    expect(result.notes[1]).toEqual({ verdict: 'recognition', reasons: ['mergedNotes'] });
    expect(result.estimatedAccuracy).toBe(0.5);
  });

  it('does not flag mergedNotes when the neighbour has another pitch', () => {
    const result = estimateRecognition(input([ref(0), missing(1, { expectedMidi: 69 })], [ev()]));
    expect(result.notes[1].verdict).toBe('uncertain');
  });

  it('flags a missing note while the window was loud as missingLoud', () => {
    const notes = [ref(0), missing(1, { expectedMidi: 72, windowLevelDb: HIGH_LEVEL_DB }), ref(2, { playedIndex: 1 })];
    const result = estimateRecognition(input(notes, [ev(), ev()]));
    expect(result.notes[1]).toEqual({ verdict: 'recognition', reasons: ['missingLoud'] });
  });

  it('keeps a missing note in a quiet window or without level data uncertain', () => {
    const quiet = [ref(0), missing(1, { expectedMidi: 72, windowLevelDb: HIGH_LEVEL_DB - 1 }), ref(2, { playedIndex: 1 })];
    expect(estimateRecognition(input(quiet, [ev(), ev()])).notes[1].verdict).toBe('uncertain');
    const unknown = [ref(0), missing(1, { expectedMidi: 72, windowLevelDb: null }), ref(2, { playedIndex: 1 })];
    expect(estimateRecognition(input(unknown, [ev(), ev()])).notes[1].verdict).toBe('uncertain');
  });

  it('flags a suspicious count-in event that no note uses', () => {
    const result = estimateRecognition(input([ref(0)], [ev({ durationMs: 50 }), ev()]));
    expect(result.events).toEqual([
      { verdict: 'recognition', reasons: ['shortEvent'] },
      { verdict: 'ok', reasons: [] },
    ]);
  });
});

describe('estimateRecognition: likely player errors', () => {
  it('judges a stable, confident wrong pitch that is not an octave or twelfth as wrongPitchStable', () => {
    expect(single({ playedMidi: 68 }).notes[0]).toEqual({ verdict: 'player', reasons: ['wrongPitchStable'] });
    expect(single({ playedMidi: 65 }).notes[0]).toEqual({ verdict: 'player', reasons: ['wrongPitchStable'] });
  });

  it('keeps a wrong pitch without pitch spread data uncertain', () => {
    expect(single({}, { pitchSpreadCents: undefined }).notes[0]).toEqual({ verdict: 'uncertain', reasons: [] });
  });

  function rhythmCase(lateOffset: number, otherOffset: number) {
    const notes = [0, 1, 2, 3].map((i) => ref(i, { offsetMs: otherOffset }));
    notes.push(ref(4, { status: 'late', offsetMs: lateOffset }));
    return estimateRecognition(input(notes, notes.map(() => ev())));
  }

  it('judges one late note while the others are on time as rhythmOutlier', () => {
    const result = rhythmCase(RHYTHM_OFFSET_MS + 50, 10);
    expect(result.notes[4]).toEqual({ verdict: 'player', reasons: ['rhythmOutlier'] });
    expect(result.estimatedAccuracy).toBe(1);
  });

  it('keeps a late note uncertain when the others are off time too', () => {
    expect(rhythmCase(RHYTHM_OFFSET_MS + 50, ON_TIME_MS + 40).notes[4].verdict).toBe('uncertain');
  });

  it('keeps a slightly late note uncertain', () => {
    expect(rhythmCase(RHYTHM_OFFSET_MS - 1, 10).notes[4].verdict).toBe('uncertain');
  });
});

describe('estimateRecognition: ok and uncertain', () => {
  it('judges a good note with a clean event ok', () => {
    expect(estimateRecognition(input([ref(0)], [ev()])).notes[0]).toEqual({ verdict: 'ok', reasons: [] });
  });

  it('keeps a good note with a suspicious event uncertain', () => {
    expect(estimateRecognition(input([ref(0)], [ev({ meanClarity: 0.5 })])).notes[0]).toEqual({
      verdict: 'uncertain',
      reasons: ['lowClarity'],
    });
  });

  it('mirrors the note verdict on its event', () => {
    const result = estimateRecognition(input([ref(0), ref(1, { status: 'wrongPitch', playedMidi: 79 })], [ev(), ev()]));
    expect(result.events).toEqual(result.notes);
    expect(result.eventCounts).toEqual({ player: 0, recognition: 1, uncertain: 0, ok: 1 });
  });

  it('caps the reasons per item', () => {
    const result = single(
      { playedMidi: 79 },
      { durationMs: 10, meanClarity: 0.1, meanLevelDb: -90, pitchSpreadCents: 900 },
    );
    expect(result.notes[0].reasons.length).toBeLessThanOrEqual(MAX_ITEM_REASONS);
    expect(result.notes[0].reasons).toEqual(['octaveJump', 'shortEvent', 'lowClarity', 'lowLevel', 'unstablePitch']);
  });
});

describe('estimateRecognition: accuracy and summary', () => {
  it('is 1 − recognition reference notes / reference notes, ignoring extra notes', () => {
    const notes = [
      ref(0),
      ref(1, { status: 'wrongPitch', playedMidi: 79 }),
      ref(2, { status: 'wrongPitch', playedMidi: 68 }),
      ref(3),
      ref(4, { refIndex: null, status: 'extra', expectedMidi: null, playedMidi: 30 }),
    ];
    const result = estimateRecognition(input(notes, notes.map(() => ev({ durationMs: 50 }))));
    // extra note: shortEvent → recognition, but it is not a reference note
    expect(result.noteCounts).toEqual({ player: 0, recognition: 3, uncertain: 2, ok: 0 });
    expect(result.estimatedAccuracy).toBe(0.5);
    expect(result.reasons).toEqual({ octaveJump: 1, shortEvent: 3 });
    expect(result.heuristicVersion).toBe(HEURISTIC_VERSION);
  });

  it('rounds the accuracy to three decimals', () => {
    const notes = [ref(0), ref(1), ref(2, { status: 'wrongPitch', playedMidi: 79 })];
    expect(estimateRecognition(input(notes, notes.map(() => ev()))).estimatedAccuracy).toBe(0.667);
  });

  it('is null without reference notes', () => {
    const result = estimateRecognition(input([], []));
    expect(result.estimatedAccuracy).toBeNull();
    expect(result.signals).toEqual({
      unvoicedRatio: null,
      medianClarity: null,
      latencySpreadMs: null,
      eventsPerNote: null,
      stopped: false,
    });
    expect(result.notes).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it('treats all notes missing in quiet windows as uncertain (accuracy 1)', () => {
    const notes = [missing(0, { windowLevelDb: -70 }), missing(1, { expectedMidi: 72, windowLevelDb: -70 })];
    const result = estimateRecognition(input(notes, []));
    expect(result.notes.map((n) => n.verdict)).toEqual(['uncertain', 'uncertain']);
    expect(result.estimatedAccuracy).toBe(1);
  });

  it('treats all notes missing in loud windows as recognition errors (accuracy 0)', () => {
    const notes = [missing(0, { windowLevelDb: -10 }), missing(1, { expectedMidi: 72, windowLevelDb: -10 })];
    const result = estimateRecognition(input(notes, []));
    expect(result.reasons).toEqual({ missingLoud: 2 });
    expect(result.estimatedAccuracy).toBe(0);
  });

  it('does not count the missing notes after a stop as missingLoud', () => {
    const notes = [
      ref(0),
      missing(1, { expectedMidi: 72, windowLevelDb: -10 }),
      ref(2, { playedIndex: 1 }),
      missing(3, { expectedMidi: 72, windowLevelDb: -10 }),
      missing(4, { expectedMidi: 74, windowLevelDb: -10 }),
    ];
    const result = estimateRecognition(input(notes, [ev(), ev()], { ended: 'stopped' }));
    expect(result.signals.stopped).toBe(true);
    expect(result.notes.map((n) => n.verdict)).toEqual(['ok', 'recognition', 'ok', 'uncertain', 'uncertain']);
    expect(result.reasons).toEqual({ missingLoud: 1 });
    expect(result.estimatedAccuracy).toBe(0.8);
  });

  it('computes the attempt signals', () => {
    const notes = [ref(0, { offsetMs: 0 }), ref(1, { offsetMs: 20 }), ref(2, { offsetMs: 100 }), missing(3)];
    const result = estimateRecognition(
      input(notes, [ev(), ev(), ev(), ev()], { signal: { frames: 1000, voicedFrames: 800, medianClarity: 0.9 } }),
    );
    expect(result.signals).toEqual({
      unvoicedRatio: 0.2,
      medianClarity: 0.9,
      latencySpreadMs: 33, // median 20, |0−20|+|20−20|+|100−20| = 100, / 3
      eventsPerNote: 1,
      stopped: false,
    });
  });

  it('keeps every count consistent with the item lists', () => {
    const result = estimateRecognition(input([ref(0), missing(1, { expectedMidi: 70 }), extra(1, 30)], [ev(), ev()]));
    const sum = (c: Record<string, number>) => VERDICTS.reduce((s, v) => s + c[v], 0);
    expect(sum(result.noteCounts as unknown as Record<string, number>)).toBe(3);
    expect(sum(result.eventCounts as unknown as Record<string, number>)).toBe(2);
    for (const item of [...result.notes, ...result.events]) {
      for (const code of item.reasons) expect(REASON_CODES).toContain(code);
    }
  });
});

describe('estimateRecognition: robustness', () => {
  it('handles a record without the optional fields (uncertain instead of throwing)', () => {
    const record = sampleAttempt() as unknown as EstimateInput;
    const result = estimateRecognition(record);
    expect(result.notes).toHaveLength(3);
    expect(result.events).toHaveLength(1);
    expect(result.signals.unvoicedRatio).toBeNull();
    expect(result.notes[2].verdict).toBe('uncertain');
  });

  it('links no event when the record has fewer events than played notes', () => {
    const result = estimateRecognition(input([ref(0, { status: 'wrongPitch', playedMidi: 68 }), ref(1)], [ev()]));
    expect(result.notes[0].verdict).toBe('uncertain');
    expect(result.events).toEqual([{ verdict: 'uncertain', reasons: [] }]);
  });

  it('has no import statements (the client compiles it too)', () => {
    const source = readFileSync(new URL('../src/spike-nuty/recognition-estimate.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/^\s*export\s+(\*|\{[^}]*\})\s+from\b/m);
  });
});

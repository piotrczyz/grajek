import { describe, expect, it } from 'vitest';
import { MAX_EVENTS, MAX_NOTES, MAX_USER_AGENT, parseAttempt, parseAttemptId } from '../src/spike-nuty/validation.js';
import { ATTEMPT_ID, sampleAttempt, sampleFullAttempt } from './spike-nuty-fakes.js';

type Body = Record<string, unknown>;

function withNested(path: string[], value: unknown): Body {
  const body = structuredClone(sampleAttempt());
  let target: Body = body;
  for (const key of path.slice(0, -1)) {
    target = target[key] as Body;
  }
  target[path[path.length - 1]] = value;
  return body;
}

describe('parseAttempt', () => {
  it('round-trips a valid record', () => {
    expect(parseAttempt(sampleAttempt())).toEqual(sampleAttempt());
  });

  it('accepts a device without the optional platform and mobile', () => {
    const parsed = parseAttempt(withNested(['device'], { userAgent: 'UA', standalone: false }));
    expect(parsed?.device).toEqual({ userAgent: 'UA', standalone: false });
  });

  it('drops unknown fields at every level', () => {
    const body = structuredClone(sampleAttempt({ name: 'Ala', profile: { age: 9 } }));
    (body.settings as Body).profileName = 'Ala';
    (body.device as Body).ip = '10.0.0.1';
    ((body.notes as Body[])[0] as Body).extra = 1;
    ((body.events as Body[])[0] as Body).audio = 'base64';
    const parsed = parseAttempt(body) as unknown as Body;
    expect(parsed).toEqual(sampleAttempt());
    expect(parsed).not.toHaveProperty('name');
    expect(parsed.device).not.toHaveProperty('ip');
  });

  it('accepts the caps exactly', () => {
    const event = (sampleAttempt().events as Body[])[0];
    const note = (sampleAttempt().notes as Body[])[0];
    const body = sampleAttempt({
      events: Array.from({ length: MAX_EVENTS }, () => event),
      notes: Array.from({ length: MAX_NOTES }, () => note),
    });
    expect(parseAttempt(body)).not.toBeNull();
  });

  it('rejects 201 events', () => {
    const event = (sampleAttempt().events as Body[])[0];
    expect(parseAttempt(sampleAttempt({ events: Array.from({ length: MAX_EVENTS + 1 }, () => event) }))).toBeNull();
  });

  it('rejects 401 notes', () => {
    const note = (sampleAttempt().notes as Body[])[0];
    expect(parseAttempt(sampleAttempt({ notes: Array.from({ length: MAX_NOTES + 1 }, () => note) }))).toBeNull();
  });

  it('rejects a user agent over 512 characters', () => {
    expect(parseAttempt(withNested(['device', 'userAgent'], 'x'.repeat(MAX_USER_AGENT + 1)))).toBeNull();
    expect(parseAttempt(withNested(['device', 'userAgent'], 'x'.repeat(MAX_USER_AGENT)))).not.toBeNull();
  });

  it.each([
    ['instrument', ['settings', 'instrument'], 'piano'],
    ['note status', ['notes', '0', 'status'], 'perfect'],
    ['ended', ['ended'], 'aborted'],
  ])('rejects a bad enum (%s)', (_name, path, value) => {
    expect(parseAttempt(withNested(path, value))).toBeNull();
  });

  it.each([
    ['clientTs', ['clientTs']],
    ['centsDiff', ['notes', '0', 'centsDiff']],
    ['meanCents', ['events', '0', 'meanCents']],
    ['correctionMs', ['timing', 'correctionMs']],
  ])('rejects NaN and Infinity (%s)', (_name, path) => {
    expect(parseAttempt(withNested(path, Number.NaN))).toBeNull();
    expect(parseAttempt(withNested(path, Number.POSITIVE_INFINITY))).toBeNull();
  });

  it.each([
    ['bpm below 20', ['settings', 'bpm'], 19],
    ['bpm above 300', ['settings', 'bpm'], 301],
    ['fractional bpm', ['settings', 'bpm'], 80.5],
    ['prepSec above 60', ['settings', 'prepSec'], 61],
    ['score above 100', ['result', 'scorePercent'], 101],
    ['count above 500', ['result', 'counts', 'good'], 501],
    ['missing count', ['result', 'counts', 'extra'], undefined],
    ['clarity above 1', ['events', '0', 'meanClarity'], 1.01],
    ['midi above 127', ['events', '0', 'midi'], 128],
    ['string number', ['timing', 'samples'], '2'],
    ['long build', ['app', 'build'], 'x'.repeat(65)],
    ['long melodyId', ['settings', 'melodyId'], 'x'.repeat(65)],
    ['non-boolean standalone', ['device', 'standalone'], 'yes'],
    ['notes not an array', ['notes'], {}],
    ['wrong version', ['v'], 2],
  ])('rejects %s', (_name, path, value) => {
    expect(parseAttempt(withNested(path, value))).toBeNull();
  });

  it('rejects a non-UUID device id', () => {
    expect(parseAttempt(sampleAttempt({ deviceId: 'not-a-uuid' }))).toBeNull();
    expect(parseAttempt(sampleAttempt({ deviceId: ATTEMPT_ID.toUpperCase() }))).toBeNull();
  });

  it('rejects non-object bodies', () => {
    expect(parseAttempt(null)).toBeNull();
    expect(parseAttempt([])).toBeNull();
    expect(parseAttempt('{}')).toBeNull();
  });
});

describe('parseAttemptId', () => {
  it('accepts a lower-case UUID v4 and nothing else', () => {
    expect(parseAttemptId(ATTEMPT_ID)).toBe(ATTEMPT_ID);
    expect(parseAttemptId('not-a-uuid')).toBeNull();
    expect(parseAttemptId(ATTEMPT_ID.toUpperCase())).toBeNull();
  });
});

describe('parseAttempt optional signal and estimate fields', () => {
  function full(path: string[], value: unknown): Body {
    const body = structuredClone(sampleFullAttempt());
    let target: Body = body;
    for (const key of path.slice(0, -1)) {
      target = target[key] as Body;
    }
    target[path[path.length - 1]] = value;
    return body;
  }

  it('round-trips a body with every optional field', () => {
    const body = sampleFullAttempt();
    expect(parseAttempt(body)).toEqual(body);
  });

  it('keeps the optional fields absent for a v1 body without them', () => {
    const parsed = parseAttempt(sampleAttempt()) as unknown as Body;
    expect(parsed).not.toHaveProperty('signal');
    expect(parsed).not.toHaveProperty('estimate');
    expect((parsed.notes as Body[])[0]).not.toHaveProperty('windowLevelDb');
    expect((parsed.events as Body[])[0]).not.toHaveProperty('pitchSpreadCents');
  });

  it('accepts a null windowLevelDb and a null estimatedAccuracy', () => {
    expect(parseAttempt(full(['notes', '0', 'windowLevelDb'], null))).not.toBeNull();
    expect(parseAttempt(full(['estimate', 'estimatedAccuracy'], null))).not.toBeNull();
  });

  it('accepts an unknown reason code of the right shape (a later heuristic version)', () => {
    const body = full(['estimate', 'reasons'], { newCode2: 3 });
    (((body.estimate as Body).notes as Body[])[0] as Body).reasons = ['newCode2'];
    expect(parseAttempt(body)).not.toBeNull();
  });

  it.each([
    ['bad verdict', ['estimate', 'notes', '0', 'verdict'], 'maybe'],
    ['notes length mismatch', ['estimate', 'notes'], [{ verdict: 'ok', reasons: [] }]],
    ['events length mismatch', ['estimate', 'events'], []],
    ['7 reasons on one item', ['estimate', 'notes', '0', 'reasons'], ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']],
    ['bad reason code', ['estimate', 'notes', '0', 'reasons'], ['Octave jump']],
    ['bad reason key', ['estimate', 'reasons'], { 'octave-jump': 1 }],
    ['33 reason keys', ['estimate', 'reasons'], Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`c${i}`, 1]))],
    ['reason count above 400', ['estimate', 'reasons'], { octaveJump: 401 }],
    ['accuracy 1.1', ['estimate', 'estimatedAccuracy'], 1.1],
    ['empty heuristic version', ['estimate', 'heuristicVersion'], ''],
    ['heuristic version over 32', ['estimate', 'heuristicVersion'], 'x'.repeat(33)],
    ['verdict count above 400', ['estimate', 'noteCounts', 'ok'], 401],
    ['missing verdict count', ['estimate', 'eventCounts', 'player'], undefined],
    ['unvoiced ratio above 1', ['estimate', 'signals', 'unvoicedRatio'], 1.5],
    ['negative latency spread', ['estimate', 'signals', 'latencySpreadMs'], -1],
    ['non-boolean stopped', ['estimate', 'signals', 'stopped'], 'no'],
    ['voicedFrames above frames', ['signal', 'voicedFrames'], 501],
    ['fractional frames', ['signal', 'frames'], 10.5],
    ['medianClarity above 1', ['signal', 'medianClarity'], 1.2],
    ['pitch spread above 2400', ['events', '0', 'pitchSpreadCents'], 2401],
    ['negative pitch spread', ['events', '0', 'pitchSpreadCents'], -1],
    ['window level above 20 dB', ['notes', '0', 'windowLevelDb'], 21],
    ['window level below -200 dB', ['notes', '0', 'windowLevelDb'], -201],
    ['estimate not an object', ['estimate'], 'x'],
    ['signal null', ['signal'], null],
  ])('rejects %s', (_name, path, value) => {
    expect(parseAttempt(full(path, value))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_COMMENT,
  MAX_EVENTS,
  MAX_NOTES,
  MAX_USER_AGENT,
  parseAttempt,
  parseAttemptId,
  parseFeedback,
} from '../src/spike-nuty/validation.js';
import { ATTEMPT_ID, sampleAttempt, sampleFeedback } from './spike-nuty-fakes.js';

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

describe('parseFeedback', () => {
  it('keeps the whitelisted fields and trims the comment', () => {
    expect(parseFeedback({ ...sampleFeedback(), extra: 'x' })).toEqual({
      ...sampleFeedback(),
      comment: 'grałam dobrze',
    });
  });

  it('accepts agreement with an empty misjudged list and no comment', () => {
    const parsed = parseFeedback(sampleFeedback({ agrees: true, misjudged: [], comment: undefined }));
    expect(parsed).toEqual({ v: 1, deviceId: sampleFeedback().deviceId, agrees: true, misjudged: [], regraded: false });
  });

  it('drops a comment that is empty after trimming', () => {
    expect(parseFeedback(sampleFeedback({ comment: '   ' }))).not.toHaveProperty('comment');
  });

  it('rejects agrees: true with a non-empty misjudged list', () => {
    expect(parseFeedback(sampleFeedback({ agrees: true }))).toBeNull();
  });

  it('rejects a comment of 501 characters', () => {
    expect(parseFeedback(sampleFeedback({ comment: 'x'.repeat(MAX_COMMENT + 1) }))).toBeNull();
    expect(parseFeedback(sampleFeedback({ comment: 'x'.repeat(MAX_COMMENT) }))).not.toBeNull();
  });

  it.each([
    ['non-UUID device id', { deviceId: 'abc' }],
    ['missing regraded', { regraded: undefined }],
    ['bad misjudged item', { misjudged: [{ refIndex: 'one', playedIndex: null }] }],
    ['too many misjudged', { misjudged: Array.from({ length: 401 }, () => ({ refIndex: 0, playedIndex: 0 })) }],
    ['wrong version', { v: 2 }],
  ])('rejects %s', (_name, overrides) => {
    expect(parseFeedback(sampleFeedback(overrides))).toBeNull();
  });
});

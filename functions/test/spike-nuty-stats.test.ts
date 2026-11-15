import { describe, expect, it } from 'vitest';
import { expireAtFor } from '../src/spike-nuty/repository.js';
import { computeStats, deviceClass, median, midiName, type AttemptDoc } from '../src/spike-nuty/stats.js';
import type { AttemptRecord } from '../src/spike-nuty/types.js';
import { OTHER_DEVICE_ID, sampleAttempt } from './spike-nuty-fakes.js';

const AT = new Date('2026-11-15T10:00:00Z');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

function doc(id: string, overrides: Record<string, unknown> = {}, extra: Partial<AttemptDoc> = {}): AttemptDoc {
  return {
    ...(sampleAttempt(overrides) as unknown as AttemptRecord),
    id,
    receivedAt: AT,
    expireAt: expireAtFor(AT),
    ...extra,
  };
}

const withScore = (scorePercent: number) => ({
  result: { ...(sampleAttempt().result as object), scorePercent },
});

describe('deviceClass', () => {
  it.each([
    [IPHONE, 'ios'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'ios'],
    [ANDROID, 'android'],
    [WINDOWS, 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15', 'desktop'],
    ['Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0', 'desktop'],
    ['curl/8.0', 'other'],
    ['', 'other'],
  ])('%s → %s', (ua, cls) => {
    expect(deviceClass(ua)).toBe(cls);
  });
});

describe('median and midiName', () => {
  it('takes the middle value or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('names MIDI numbers in scientific pitch notation', () => {
    expect(midiName(60)).toBe('C4');
    expect(midiName(67)).toBe('G4');
    expect(midiName(70)).toBe('A#4');
    expect(midiName(null)).toBe('extra');
  });
});

describe('computeStats', () => {
  it('answers zeros and nulls for no documents', () => {
    const stats = computeStats([]);
    expect(stats).toMatchObject({
      attempts: 0,
      devices: 0,
      ended: { complete: 0, stopped: 0 },
      feedback: { answered: 0, agrees: 0, agreesPercent: null },
      topMisjudged: [],
      latencyByDeviceClass: {},
      octaveErrorRate: null,
      twelfthErrorRate: null,
      truncated: false,
    });
    expect(stats.scoreHistogram).toHaveLength(10);
    expect(stats.scoreHistogram.every((b) => b.count === 0)).toBe(true);
  });

  it('counts attempts, devices, endings and the score histogram', () => {
    const stats = computeStats(
      [
        doc('a', withScore(0)),
        doc('b', { ...withScore(9), ended: 'stopped' }),
        doc('c', { ...withScore(10), deviceId: OTHER_DEVICE_ID }),
        doc('d', withScore(95)),
        doc('e', withScore(100)),
      ],
      true,
    );
    expect(stats.attempts).toBe(5);
    expect(stats.devices).toBe(2);
    expect(stats.ended).toEqual({ complete: 4, stopped: 1 });
    expect(stats.scoreHistogram[0]).toEqual({ from: 0, to: 9, count: 2 });
    expect(stats.scoreHistogram[1]).toEqual({ from: 10, to: 19, count: 1 });
    expect(stats.scoreHistogram[9]).toEqual({ from: 90, to: 100, count: 2 });
    expect(stats.truncated).toBe(true);
  });

  it('counts feedback answers and the most misjudged expected notes', () => {
    const misjudgedBoth = {
      agrees: false,
      regraded: false,
      misjudged: [
        { refIndex: 1, playedIndex: 1 },
        { refIndex: 2, playedIndex: null },
      ],
    };
    const stats = computeStats([
      doc('a', {}, { feedback: misjudgedBoth, feedbackAt: AT }),
      doc('b', {}, { feedback: { agrees: false, regraded: true, misjudged: [{ refIndex: 0, playedIndex: 0 }] } }),
      doc('c', {}, { feedback: { agrees: true, regraded: false, misjudged: [] } }),
      doc('d'),
      // An index the attempt does not have is ignored.
      doc('e', {}, { feedback: { agrees: false, regraded: false, misjudged: [{ refIndex: 99, playedIndex: null }] } }),
    ]);
    expect(stats.feedback).toEqual({ answered: 4, agrees: 1, agreesPercent: 25 });
    // Notes 1 and 2 of the sample both expect MIDI 64; note 0 expects 67.
    expect(stats.topMisjudged).toEqual([
      { expectedMidi: 64, name: 'E4', count: 2 },
      { expectedMidi: 67, name: 'G4', count: 1 },
    ]);
  });

  it('maps a misjudged extra note by its played index and keeps the top 10', () => {
    const extraNote = {
      nr: 4,
      refIndex: null,
      playedIndex: 7,
      expectedMidi: null,
      playedMidi: 70,
      centsDiff: null,
      offsetMs: null,
      status: 'extra',
      octaveOff: false,
      twelfthOff: false,
    };
    const notes = Array.from({ length: 12 }, (_, i) => ({
      ...(sampleAttempt().notes as Array<Record<string, unknown>>)[0],
      nr: i + 1,
      refIndex: i,
      playedIndex: i,
      expectedMidi: 60 + i,
    }));
    const misjudged = [
      ...notes.map((_, i) => ({ refIndex: i, playedIndex: i })),
      { refIndex: null, playedIndex: 7 },
      { refIndex: null, playedIndex: 7 },
    ];
    const stats = computeStats([
      doc('a', { notes: [...notes, extraNote] }, { feedback: { agrees: false, regraded: false, misjudged } }),
    ]);
    expect(stats.topMisjudged).toHaveLength(10);
    expect(stats.topMisjudged[0]).toEqual({ expectedMidi: null, name: 'extra', count: 2 });
    expect(stats.topMisjudged[1]).toEqual({ expectedMidi: 60, name: 'C4', count: 1 });
  });

  it('gives latency medians per device class', () => {
    const timing = (outputLatencyMs: number | null, medianOffsetMs: number | null) => ({
      timing: { outputLatencyMs, medianOffsetMs, meanOffsetMs: null, correctionMs: 0, samples: 1 },
    });
    const stats = computeStats([
      doc('a', { device: { userAgent: IPHONE, standalone: true }, ...timing(40, 10) }),
      doc('b', { device: { userAgent: IPHONE, standalone: false }, ...timing(60, 30) }),
      doc('c', { device: { userAgent: IPHONE, standalone: false }, ...timing(null, null) }),
      doc('d', { device: { userAgent: ANDROID, standalone: false }, ...timing(null, null) }),
      doc('e', { device: { userAgent: WINDOWS, standalone: false }, ...timing(20, -5) }),
    ]);
    expect(stats.latencyByDeviceClass).toEqual({
      ios: { attempts: 3, medianOutputLatencyMs: 50, medianOffsetMs: 20 },
      android: { attempts: 1, medianOutputLatencyMs: null, medianOffsetMs: null },
      desktop: { attempts: 1, medianOutputLatencyMs: 20, medianOffsetMs: -5 },
    });
  });

  it('rates octave and twelfth errors over notes with a played pitch', () => {
    // Sample notes: 2 with a played pitch, one of them octaveOff.
    const twelfthNote = {
      nr: 4,
      refIndex: 3,
      playedIndex: 2,
      expectedMidi: 60,
      playedMidi: 79,
      centsDiff: 0,
      offsetMs: 0,
      status: 'wrongPitch',
      octaveOff: false,
      twelfthOff: true,
    };
    const stats = computeStats([
      doc('a'),
      doc('b', { notes: [...(sampleAttempt().notes as unknown[]), twelfthNote] }),
    ]);
    expect(stats.octaveErrorRate).toBe(0.4);
    expect(stats.twelfthErrorRate).toBe(0.2);
  });
});

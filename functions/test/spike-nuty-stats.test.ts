import { describe, expect, it } from 'vitest';
import {
  HEURISTIC_VERSION,
  type EstimateSignals,
  type RecognitionEstimate,
  type Verdict,
} from '../src/spike-nuty/recognition-estimate.js';
import { expireAtFor } from '../src/spike-nuty/repository.js';
import {
  computeStats,
  deviceClass,
  median,
  midiName,
  REPEAT_SCORE_DIFF,
  REPEAT_WINDOW_MS,
  resolveEstimate,
  type AttemptDoc,
} from '../src/spike-nuty/stats.js';
import type { AttemptRecord } from '../src/spike-nuty/types.js';
import { OTHER_DEVICE_ID, sampleAttempt, sampleFullAttempt } from './spike-nuty-fakes.js';

const AT = new Date('2026-11-15T10:00:00Z');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const MINUTE = 60 * 1000;

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

/**
 * A stored estimate of the current heuristic version, aligned with the
 * sample's 3 notes and 1 event, with the given accuracy, reasons, note
 * verdicts and signals.
 */
function est(
  estimatedAccuracy: number | null,
  options: { reasons?: Record<string, number>; notes?: Verdict[]; signals?: Partial<EstimateSignals> } = {},
): RecognitionEstimate {
  const verdicts = options.notes ?? ['ok', 'ok', 'ok'];
  const counts = { player: 0, recognition: 0, uncertain: 0, ok: 0 };
  verdicts.forEach((v) => {
    counts[v] += 1;
  });
  return {
    heuristicVersion: HEURISTIC_VERSION,
    estimatedAccuracy,
    noteCounts: counts,
    eventCounts: { player: 0, recognition: 0, uncertain: 0, ok: 1 },
    reasons: options.reasons ?? {},
    notes: verdicts.map((verdict) => ({ verdict, reasons: [] })),
    events: [{ verdict: 'ok', reasons: [] }],
    signals: {
      unvoicedRatio: null,
      medianClarity: null,
      latencySpreadMs: null,
      eventsPerNote: null,
      stopped: false,
      ...options.signals,
    },
  };
}

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

describe('resolveEstimate', () => {
  it('uses the stored estimate of the current heuristic version', () => {
    const full = { ...(sampleFullAttempt() as unknown as AttemptRecord), id: 'a', receivedAt: AT, expireAt: AT };
    const resolved = resolveEstimate(full);
    expect(resolved.source).toBe('stored');
    expect(resolved.estimate).toBe(full.estimate);
  });

  it('recomputes from the raw record when no estimate is stored', () => {
    // Sample: note 2 is octaveOff (recognition), note 3 missing without a level (uncertain).
    const resolved = resolveEstimate(doc('a'));
    expect(resolved.source).toBe('recomputed');
    expect(resolved.estimate.heuristicVersion).toBe(HEURISTIC_VERSION);
    expect(resolved.estimate.estimatedAccuracy).toBe(0.667);
    expect(resolved.estimate.reasons).toEqual({ octaveJump: 1 });
  });

  it('recomputes an estimate of another heuristic version', () => {
    const old = { ...est(0.1), heuristicVersion: '0' };
    const resolved = resolveEstimate(doc('a', { estimate: old }));
    expect(resolved.source).toBe('recomputed');
    expect(resolved.estimate.estimatedAccuracy).toBe(0.667);
  });

  it('recomputes a stored estimate whose item lists do not match the record', () => {
    const misaligned = { ...est(0.1), notes: [] };
    expect(resolveEstimate(doc('a', { estimate: misaligned })).source).toBe('recomputed');
  });
});

describe('computeStats', () => {
  it('answers zeros and nulls for no documents', () => {
    const stats = computeStats([]);
    expect(stats).toMatchObject({
      attempts: 0,
      devices: 0,
      ended: { complete: 0, stopped: 0 },
      latencyByDeviceClass: {},
      octaveErrorRate: null,
      twelfthErrorRate: null,
      estimateSource: { stored: 0, recomputed: 0 },
      estimate: {
        heuristicVersion: HEURISTIC_VERSION,
        noAccuracy: 0,
        meanAccuracy: null,
        medianAccuracy: null,
        topRecognitionReasons: [],
        byMelody: {},
        byExpectedNote: [],
        byDeviceClass: {},
        daily: [],
        signals: {
          medianUnvoicedRatio: null,
          medianClarity: null,
          medianLatencySpreadMs: null,
          medianEventsPerNote: null,
          stoppedShare: null,
        },
      },
      repeats: { pairs: 0, divergent: 0, medianAccuracyDiff: null },
      truncated: false,
    });
    expect(stats).not.toHaveProperty('feedback');
    expect(stats).not.toHaveProperty('topMisjudged');
    expect(stats.scoreHistogram).toHaveLength(10);
    expect(stats.scoreHistogram.every((b) => b.count === 0)).toBe(true);
    expect(stats.estimate.accuracyHistogram).toHaveLength(10);
    expect(stats.estimate.accuracyHistogram.every((b) => b.count === 0)).toBe(true);
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

  it('counts stored and recomputed estimates (missing and old heuristic version)', () => {
    const stats = computeStats([
      doc('stored', { estimate: est(0.5) }),
      doc('missing'),
      doc('old', { estimate: { ...est(0.5), heuristicVersion: '0' } }),
    ]);
    expect(stats.estimateSource).toEqual({ stored: 1, recomputed: 2 });
    // 0.5 stored, 0.667 recomputed twice.
    expect(stats.estimate.meanAccuracy).toBe(0.611);
    expect(stats.estimate.medianAccuracy).toBe(0.667);
  });

  it('builds the accuracy histogram, mean, median and the count without an accuracy', () => {
    const stats = computeStats([
      doc('a', { estimate: est(0) }),
      doc('b', { estimate: est(0.1) }),
      doc('c', { estimate: est(0.9) }),
      doc('d', { estimate: est(1) }),
      doc('e', { estimate: est(null) }),
    ]);
    const histogram = stats.estimate.accuracyHistogram;
    expect(histogram[0]).toEqual({ from: 0, to: 0.1, count: 1 });
    expect(histogram[1]).toEqual({ from: 0.1, to: 0.2, count: 1 });
    expect(histogram[9]).toEqual({ from: 0.9, to: 1, count: 2 });
    expect(histogram.reduce((sum, b) => sum + b.count, 0)).toBe(4);
    expect(stats.estimate.noAccuracy).toBe(1);
    expect(stats.estimate.meanAccuracy).toBe(0.5);
    expect(stats.estimate.medianAccuracy).toBe(0.5);
  });

  it('sums the recognition reasons into the top list, most frequent first', () => {
    const stats = computeStats([
      doc('a', { estimate: est(0.5, { reasons: { octaveJump: 2, shortEvent: 1 } }) }),
      doc('b', { estimate: est(0.5, { reasons: { shortEvent: 2, lowClarity: 3 } }) }),
      doc('c', { estimate: est(1) }),
    ]);
    // Ties keep the REASON_CODES order: shortEvent before lowClarity.
    expect(stats.estimate.topRecognitionReasons).toEqual([
      { reason: 'shortEvent', count: 3 },
      { reason: 'lowClarity', count: 3 },
      { reason: 'octaveJump', count: 2 },
    ]);
  });

  it('breaks the accuracy down per melody, device class and UTC day', () => {
    const melody = (melodyId: string) => ({ settings: { ...(sampleAttempt().settings as object), melodyId } });
    const ua = (userAgent: string) => ({ device: { userAgent, standalone: false } });
    const stats = computeStats([
      doc('a', { ...melody('wlazl-kotek'), ...ua(IPHONE), estimate: est(0.4) }, { receivedAt: new Date('2026-11-14T23:59:59Z') }),
      doc('b', { ...melody('wlazl-kotek'), ...ua(IPHONE), estimate: est(0.8) }, { receivedAt: new Date('2026-11-15T00:00:00Z') }),
      doc('c', { ...melody('gamma'), ...ua(ANDROID), estimate: est(null) }, { receivedAt: new Date('2026-11-15T12:00:00Z') }),
    ]);
    expect(stats.estimate.byMelody).toEqual({
      gamma: { attempts: 1, meanAccuracy: null },
      'wlazl-kotek': { attempts: 2, meanAccuracy: 0.6 },
    });
    expect(stats.estimate.byDeviceClass).toEqual({
      ios: { attempts: 2, meanAccuracy: 0.6 },
      android: { attempts: 1, meanAccuracy: null },
    });
    expect(stats.estimate.daily).toEqual([
      { day: '2026-11-14', attempts: 1, meanAccuracy: 0.4 },
      { day: '2026-11-15', attempts: 2, meanAccuracy: 0.8 },
    ]);
  });

  it('counts the note verdicts per expected note, aligned with the record notes', () => {
    const extraNote = {
      nr: 4,
      refIndex: null,
      playedIndex: 2,
      expectedMidi: null,
      playedMidi: 70,
      centsDiff: null,
      offsetMs: null,
      status: 'extra',
      octaveOff: false,
      twelfthOff: false,
    };
    const notes = [...(sampleAttempt().notes as unknown[]), extraNote];
    const four = (verdicts: Verdict[]) => est(0.5, { notes: verdicts });
    const stats = computeStats([
      // Sample notes expect 67, 64, 64; the extra note expects nothing.
      doc('a', { notes, estimate: four(['ok', 'recognition', 'uncertain', 'recognition']) }),
      doc('b', { estimate: est(0.5, { notes: ['player', 'ok', 'recognition'] }) }),
    ]);
    expect(stats.estimate.byExpectedNote).toEqual([
      { expectedMidi: 64, name: 'E4', notes: 4, player: 0, recognition: 2, uncertain: 1, ok: 1 },
      { expectedMidi: 67, name: 'G4', notes: 2, player: 1, recognition: 0, uncertain: 0, ok: 1 },
      { expectedMidi: null, name: 'extra', notes: 1, player: 0, recognition: 1, uncertain: 0, ok: 0 },
    ]);
  });

  it('gives the medians of the attempt-level signals and the stopped share', () => {
    const signals = (unvoicedRatio: number | null, medianClarity: number | null, latencySpreadMs: number | null, eventsPerNote: number | null) =>
      est(0.5, { signals: { unvoicedRatio, medianClarity, latencySpreadMs, eventsPerNote } });
    const stats = computeStats([
      doc('a', { estimate: signals(0.1, 0.9, 20, 1) }),
      doc('b', { estimate: signals(0.3, 0.7, 40, 1.5), ended: 'stopped' }),
      doc('c', { estimate: signals(null, null, null, null) }),
      doc('d', { estimate: signals(0.2, 0.8, 10, 2) }),
    ]);
    expect(stats.estimate.signals).toEqual({
      medianUnvoicedRatio: 0.2,
      medianClarity: 0.8,
      medianLatencySpreadMs: 20,
      medianEventsPerNote: 1.5,
      stoppedShare: 0.25,
    });
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

describe('repeat detection', () => {
  const at = (minutes: number) => new Date(AT.getTime() + minutes * MINUTE);
  const attempt = (id: string, minutes: number, score: number, accuracy: number | null, overrides: Record<string, unknown> = {}) =>
    doc(id, { ...withScore(score), estimate: est(accuracy), ...overrides }, { receivedAt: at(minutes) });

  it('uses a five-minute window and a 30-point score difference', () => {
    expect(REPEAT_WINDOW_MS).toBe(5 * MINUTE);
    expect(REPEAT_SCORE_DIFF).toBe(30);
  });

  it('counts consecutive attempts of one device and melody inside the window, divergent by score', () => {
    const stats = computeStats([
      // Listed out of order: pairs follow receivedAt.
      attempt('b', 3, 90, 0.9),
      attempt('a', 0, 40, 0.5),
      // 5 minutes after b, exactly at the window and exactly 30 points apart.
      attempt('c', 8, 60, 0.6),
    ]);
    expect(stats.repeats).toEqual({ pairs: 2, divergent: 2, medianAccuracyDiff: 0.35 });
  });

  it('does not count attempts outside the window or below the score threshold', () => {
    const stats = computeStats([
      attempt('a', 0, 40, 0.5),
      // 5 min + 1 ms later: outside the window.
      doc('b', { ...withScore(95), estimate: est(0.9) }, { receivedAt: new Date(at(5).getTime() + 1) }),
      // Inside the window of b, 29 points apart: a pair, not divergent.
      attempt('c', 6, 66, 0.7),
    ]);
    expect(stats.repeats).toEqual({ pairs: 1, divergent: 0, medianAccuracyDiff: null });
  });

  it('keeps different devices and different melodies apart', () => {
    const stats = computeStats([
      attempt('a', 0, 10, 0.2),
      attempt('b', 1, 90, 0.9, { deviceId: OTHER_DEVICE_ID }),
      attempt('c', 2, 90, 0.9, { settings: { ...(sampleAttempt().settings as object), melodyId: 'gamma' } }),
    ]);
    expect(stats.repeats).toEqual({ pairs: 0, divergent: 0, medianAccuracyDiff: null });
  });

  it('leaves divergent pairs without an accuracy out of the accuracy difference', () => {
    const stats = computeStats([attempt('a', 0, 10, null), attempt('b', 1, 90, 0.9)]);
    expect(stats.repeats).toEqual({ pairs: 1, divergent: 1, medianAccuracyDiff: null });
  });
});

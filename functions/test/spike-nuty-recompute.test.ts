import { describe, expect, it } from 'vitest';
import { estimateRecognition, HEURISTIC_VERSION, type EstimateInput } from '../src/spike-nuty/recognition-estimate.js';
import {
  parseRecomputeArgs,
  planRecompute,
  RECOMPUTE_BATCH_SIZE,
  summarize,
  toBatches,
} from '../src/spike-nuty/recompute.js';
import type { StoredAttempt } from '../src/spike-nuty/types.js';
import { sampleAttempt, sampleFullAttempt } from './spike-nuty-fakes.js';

const AT = new Date('2026-11-15T10:00:00Z');
const EMULATOR = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };

function stored(body: Record<string, unknown>): StoredAttempt {
  return { ...(body as unknown as StoredAttempt), receivedAt: AT, expireAt: AT };
}

describe('parseRecomputeArgs', () => {
  it('refuses to run without the emulator or an explicit project', () => {
    expect(parseRecomputeArgs([], {})).toEqual({ ok: false, error: expect.stringContaining('no target') });
    expect(parseRecomputeArgs(['--write'], {})).toEqual({ ok: false, error: expect.stringContaining('no target') });
  });

  it('is a dry run against the emulator by default', () => {
    expect(parseRecomputeArgs([], EMULATOR)).toEqual({
      ok: true,
      options: { help: false, write: false, target: 'emulator', projectId: 'demo-grajek', from: null, to: null },
    });
  });

  it('prefers the emulator over --project when FIRESTORE_EMULATOR_HOST is set', () => {
    const parsed = parseRecomputeArgs(['--project', 'grajek', '--write'], EMULATOR);
    expect(parsed).toMatchObject({ ok: true, options: { target: 'emulator', projectId: 'grajek', write: true } });
  });

  it('targets a real project only when it is named', () => {
    const parsed = parseRecomputeArgs(['--project', 'grajek', '--write'], {});
    expect(parsed).toMatchObject({ ok: true, options: { target: 'project', projectId: 'grajek', write: true } });
    expect(parseRecomputeArgs(['--project', 'grajek'], {})).toMatchObject({ ok: true, options: { write: false } });
  });

  it('turns --from/--to into a half-open UTC range with --to inclusive', () => {
    const parsed = parseRecomputeArgs(['--from', '2026-11-01', '--to', '2026-11-15'], EMULATOR);
    expect(parsed).toMatchObject({
      ok: true,
      options: { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-16T00:00:00Z') },
    });
  });

  it.each([
    [['--from', '2026-02-30']],
    [['--to', 'yesterday']],
    [['--from']],
    [['--project', '--write']],
    [['--from', '2026-11-16', '--to', '2026-11-15']],
    [['--force']],
  ])('rejects %j', (argv) => {
    expect(parseRecomputeArgs(argv, EMULATOR)).toMatchObject({ ok: false });
  });

  it('answers help without a target', () => {
    expect(parseRecomputeArgs(['--help'], {})).toMatchObject({ ok: true, options: { help: true } });
  });
});

describe('planRecompute', () => {
  it('leaves an estimate equal to the recomputed one alone', () => {
    const plan = planRecompute([{ id: 'a', data: stored(sampleFullAttempt()) }]);
    expect(plan).toMatchObject({ total: 1, current: 1, changed: 0, updates: [], accuracyDeltas: [] });
  });

  it('adds a missing estimate', () => {
    const plan = planRecompute([{ id: 'a', data: stored(sampleAttempt()) }]);
    expect(plan).toMatchObject({ total: 1, current: 0, changed: 1, missing: 1, otherVersion: 0, accuracyDeltas: [] });
    expect(plan.updates).toEqual([
      { id: 'a', estimate: estimateRecognition(sampleAttempt() as unknown as EstimateInput) },
    ]);
    expect(plan.updates[0].estimate.heuristicVersion).toBe(HEURISTIC_VERSION);
  });

  it('replaces an estimate of another heuristic version and reports the accuracy change', () => {
    const full = sampleFullAttempt();
    const old = { ...(full.estimate as object), heuristicVersion: '0', estimatedAccuracy: 0.9 };
    const plan = planRecompute([{ id: 'a', data: stored({ ...full, estimate: old }) }]);
    expect(plan).toMatchObject({ changed: 1, missing: 0, otherVersion: 1, accuracyDeltas: [-0.567] });
    expect(plan.updates[0].estimate).toEqual(full.estimate);
  });

  it('replaces a current-version estimate that differs from the raw record', () => {
    const full = sampleFullAttempt();
    const tampered = { ...(full.estimate as object), estimatedAccuracy: 0.5 };
    const plan = planRecompute([{ id: 'a', data: stored({ ...full, estimate: tampered }) }]);
    expect(plan).toMatchObject({ changed: 1, missing: 0, otherVersion: 0, accuracyDeltas: [-0.167] });
  });

  it('compares estimates independently of key order', () => {
    const full = sampleFullAttempt();
    const reordered = Object.fromEntries(Object.entries(full.estimate as object).reverse());
    expect(planRecompute([{ id: 'a', data: stored({ ...full, estimate: reordered }) }]).current).toBe(1);
  });

  it('summarizes the counts and the accuracy deltas', () => {
    const full = sampleFullAttempt();
    const plan = planRecompute([
      { id: 'a', data: stored(full) },
      { id: 'b', data: stored(sampleAttempt()) },
      { id: 'c', data: stored({ ...full, estimate: { ...(full.estimate as object), estimatedAccuracy: 0.5 } }) },
      { id: 'd', data: stored({ ...full, estimate: { ...(full.estimate as object), estimatedAccuracy: 0.24 } }) },
    ]);
    expect(summarize(plan)).toEqual({
      total: 4,
      alreadyCurrent: 1,
      wouldChange: 3,
      missingEstimate: 1,
      otherHeuristicVersion: 0,
      accuracyDeltas: 2,
      meanAccuracyDelta: -0.037,
      minAccuracyDelta: -0.167,
      maxAccuracyDelta: 0.093,
    });
    expect(summarize(planRecompute([]))).toMatchObject({ total: 0, meanAccuracyDelta: null, minAccuracyDelta: null });
  });
});

describe('toBatches', () => {
  it('splits updates into Firestore-sized batches', () => {
    expect(RECOMPUTE_BATCH_SIZE).toBeLessThanOrEqual(500);
    expect(toBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(toBatches([], 2)).toEqual([]);
    expect(toBatches(Array.from({ length: 401 }, (_, i) => i))).toHaveLength(2);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GOAL,
  GOAL_MAX,
  GOAL_OPTIONS,
  isReached,
  previousWeekStarts,
  shouldOfferRaise,
  SUGGESTED_GOALS,
  validateGoal,
  weekStart,
  type WeekCount,
  type WeeklyGoal,
} from './weeklyGoal.ts';

describe('goal options', () => {
  it('offers 1 to 6 days, never 7, with 3 as default and 3–4 suggested', () => {
    expect(GOAL_OPTIONS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(GOAL_MAX).toBe(6);
    expect(DEFAULT_GOAL).toBe(3);
    expect(SUGGESTED_GOALS).toEqual([3, 4]);
  });
});

describe('validateGoal', () => {
  it.each(GOAL_OPTIONS)('accepts %i', (days) => {
    expect(validateGoal(days)).toEqual({ ok: true, value: days });
  });

  it('rejects 0 and 7 as out of range', () => {
    expect(validateGoal(0)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(validateGoal(7)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('rejects a fraction and NaN as not an integer', () => {
    expect(validateGoal(3.5)).toEqual({ ok: false, reason: 'not-integer' });
    expect(validateGoal(Number.NaN)).toEqual({ ok: false, reason: 'not-integer' });
  });
});

describe('isReached', () => {
  it('is reached at exactly N days and above, not below', () => {
    expect(isReached(3, 4)).toBe(false);
    expect(isReached(4, 4)).toBe(true);
    expect(isReached(5, 4)).toBe(true);
  });
});

describe('weekStart', () => {
  it('is the Monday of the week, also on a Sunday', () => {
    expect(weekStart(new Date(2026, 9, 11, 20, 0))).toBe('2026-10-05');
    expect(weekStart(new Date(2026, 9, 12, 0, 5))).toBe('2026-10-12');
  });
});

describe('previousWeekStarts', () => {
  it('returns the Mondays of the completed weeks before the current one, most recent first', () => {
    expect(previousWeekStarts(new Date(2026, 9, 14, 12, 0), 3)).toEqual([
      '2026-10-05',
      '2026-09-28',
      '2026-09-21',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(previousWeekStarts(new Date(2027, 0, 6, 12, 0), 3)).toEqual([
      '2026-12-28',
      '2026-12-21',
      '2026-12-14',
    ]);
  });

  describe('in Europe/Warsaw', () => {
    beforeAll(() => {
      vi.stubEnv('TZ', 'Europe/Warsaw');
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('stays on Mondays across the end of summer time (2026-10-25)', () => {
      // Monday just after midnight, the week after the clocks went back.
      const now = new Date(2026, 9, 26, 0, 30);
      expect(now.getTimezoneOffset()).toBe(-60);
      expect(previousWeekStarts(now, 3)).toEqual(['2026-10-19', '2026-10-12', '2026-10-05']);
    });

    it('stays on Mondays across the start of summer time (2027-03-28)', () => {
      const now = new Date(2027, 2, 29, 0, 30);
      expect(previousWeekStarts(now, 2)).toEqual(['2027-03-22', '2027-03-15']);
    });
  });
});

describe('shouldOfferRaise', () => {
  const goal = (patch: Partial<WeeklyGoal> = {}): WeeklyGoal => ({
    daysPerWeek: 4,
    since: '2026-09-14',
    updatedAt: '2026-09-14T10:00:00.000Z',
    ...patch,
  });
  const weeks = (...counts: number[]): WeekCount[] =>
    ['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14'].slice(0, counts.length).map((start, i) => ({
      start,
      musicDayCount: counts[i],
    }));

  it('offers after 3 reached weeks after the goal was set', () => {
    expect(shouldOfferRaise(goal(), weeks(4, 5, 4))).toBe(true);
  });

  it('does not offer with fewer than 3 weeks', () => {
    expect(shouldOfferRaise(goal(), weeks(4, 4))).toBe(false);
  });

  it('does not offer when one of the weeks was not reached', () => {
    expect(shouldOfferRaise(goal(), weeks(4, 3, 4))).toBe(false);
  });

  it('does not offer when a week is not after the week the goal was set', () => {
    expect(shouldOfferRaise(goal({ since: '2026-09-21' }), weeks(4, 4, 4))).toBe(false);
  });

  it('does not offer when a week is not after the declined offer', () => {
    expect(shouldOfferRaise(goal({ raiseDeclinedWeek: '2026-09-28' }), weeks(4, 4, 4))).toBe(false);
    expect(shouldOfferRaise(goal({ raiseDeclinedWeek: '2026-09-14' }), weeks(4, 4, 4))).toBe(true);
  });

  it('never offers above the maximum goal of 6', () => {
    expect(shouldOfferRaise(goal({ daysPerWeek: 6 }), weeks(7, 7, 7))).toBe(false);
  });
});

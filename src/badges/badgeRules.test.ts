import { describe, expect, it } from 'vitest';
import { evaluateBadges, mondayOf, newlyEarned, type BadgeInput } from './badgeRules.ts';

const pad = (n: number) => String(n).padStart(2, '0');
/** Day key `n` days after Monday 2026-01-05, built in UTC so it is exact. */
const day = (n: number) => {
  const d = new Date(Date.UTC(2026, 0, 5 + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const session = (n: number, durationMinutes = 15) => ({ day: day(n), durationMinutes });

const input = (overrides: Partial<BadgeInput>): BadgeInput => ({
  practices: [],
  goal: null,
  rememberedWeeks: [],
  ...overrides,
});

describe('mondayOf', () => {
  it('returns the Monday of the week, Sunday belonging to the week before', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
  });

  it('is not shifted by a DST change', () => {
    // Europe switches back on Sunday 2026-10-25 and forward on Sunday 2026-03-29.
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2026-03-29')).toBe('2026-03-23');
  });
});

describe('evaluateBadges', () => {
  it('awards nothing for an empty history', () => {
    expect(evaluateBadges(input({}))).toEqual({ qualifying: [], reachedWeeks: [] });
  });

  it('awards the first day badge for the first session', () => {
    expect(evaluateBadges(input({ practices: [session(0)] })).qualifying).toEqual(['days-1']);
  });

  it('crosses 5 hours at exactly 300 minutes', () => {
    const below = evaluateBadges(input({ practices: [session(0, 299)] })).qualifying;
    expect(below).toContain('time-1h');
    expect(below).not.toContain('time-5h');
    expect(evaluateBadges(input({ practices: [session(0, 240), session(0, 60)] })).qualifying).toContain('time-5h');
  });

  it('awards every time badge at its threshold', () => {
    const all = evaluateBadges(input({ practices: [session(0, 6000)] })).qualifying;
    expect(all).toEqual(['days-1', 'time-1h', 'time-5h', 'time-10h', 'time-25h', 'time-50h', 'time-100h']);
  });

  it('counts distinct days, not sessions', () => {
    const sameDay = Array.from({ length: 12 }, () => session(0, 5));
    expect(evaluateBadges(input({ practices: sameDay })).qualifying).toEqual(['days-1', 'time-1h']);
  });

  it('awards 10 days at the tenth distinct day, not the ninth', () => {
    const nine = Array.from({ length: 9 }, (_, i) => session(i, 1));
    expect(evaluateBadges(input({ practices: nine })).qualifying).not.toContain('days-10');
    const ten = [...nine, session(9, 1)];
    expect(evaluateBadges(input({ practices: ten })).qualifying).toContain('days-10');
  });

  it('counts no goal weeks without a goal', () => {
    const week = [0, 1, 2].map((n) => session(n));
    expect(evaluateBadges(input({ practices: week })).reachedWeeks).toEqual([]);
  });

  it('counts a reached goal week, including the current week as soon as it is reached', () => {
    const goal = { daysPerWeek: 3, since: day(0) };
    const twoDays = evaluateBadges(input({ practices: [session(0), session(1), session(1)], goal }));
    expect(twoDays.reachedWeeks).toEqual([]);
    const threeDays = evaluateBadges(input({ practices: [session(0), session(1), session(6)], goal }));
    expect(threeDays.reachedWeeks).toEqual([day(0)]);
    expect(threeDays.qualifying).toContain('weeks-1');
  });

  it('ignores weeks before the goal was set', () => {
    const goal = { daysPerWeek: 2, since: day(7) };
    const result = evaluateBadges(input({ practices: [session(0), session(1), session(7), session(8)], goal }));
    expect(result.reachedWeeks).toEqual([day(7)]);
  });

  it('keeps remembered weeks after the goal moved', () => {
    const goal = { daysPerWeek: 4, since: day(14) };
    const result = evaluateBadges(
      input({ practices: [session(0), session(1), session(2)], goal, rememberedWeeks: [day(7), day(0)] }),
    );
    expect(result.reachedWeeks).toEqual([day(0), day(7)]);
    expect(result.qualifying).toContain('weeks-1');
    expect(evaluateBadges(input({ rememberedWeeks: [day(0)] })).reachedWeeks).toEqual([day(0)]);
  });

  it('awards 5 goal weeks from remembered and new weeks together', () => {
    const goal = { daysPerWeek: 1, since: day(28) };
    const result = evaluateBadges(
      input({ practices: [session(28)], goal, rememberedWeeks: [day(0), day(7), day(14), day(21)] }),
    );
    expect(result.reachedWeeks).toHaveLength(5);
    expect(result.qualifying).toEqual(['days-1', 'weeks-1', 'weeks-5']);
  });

  it('awards a comeback at an 8-day difference, not 7', () => {
    expect(evaluateBadges(input({ practices: [session(0), session(7)] })).qualifying).not.toContain('comeback');
    expect(evaluateBadges(input({ practices: [session(0), session(8)] })).qualifying).toContain('comeback');
    // Unsorted input and a short gap after the long one still count.
    expect(evaluateBadges(input({ practices: [session(9), session(0), session(10)] })).qualifying).toContain(
      'comeback',
    );
  });

  it('measures a comeback across a DST change in calendar days', () => {
    const practices = [
      { day: '2026-10-20', durationMinutes: 10 },
      { day: '2026-10-28', durationMinutes: 10 },
    ];
    expect(evaluateBadges(input({ practices })).qualifying).toContain('comeback');
  });

  it('lists qualifying badges in catalog order', () => {
    const goal = { daysPerWeek: 1, since: day(0) };
    const result = evaluateBadges(input({ practices: [session(20, 60), session(0)], goal }));
    expect(result.qualifying).toEqual(['days-1', 'time-1h', 'weeks-1', 'comeback']);
  });
});

describe('newlyEarned', () => {
  it('returns qualifying badges not earned yet, in catalog order', () => {
    expect(newlyEarned(['comeback', 'days-1', 'time-1h'], ['days-1'])).toEqual(['time-1h', 'comeback']);
  });

  it('is idempotent once everything is earned', () => {
    const qualifying = ['days-1', 'time-1h'] as const;
    const first = newlyEarned(qualifying, []);
    expect(first).toEqual(['days-1', 'time-1h']);
    expect(newlyEarned(qualifying, first)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  leadingBlanks,
  MONTH_NAMES,
  MONTH_NAMES_GENITIVE,
  monthDays,
  monthRange,
  musicDaysLabel,
} from './month.ts';

describe('monthDays', () => {
  it('lists the 31 days of October, 1st to last, as local day keys', () => {
    const days = monthDays(new Date(2026, 9, 14, 23, 59));
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-10-01');
    expect(days[30]).toBe('2026-10-31');
  });

  it('lists 30 days for a 30-day month', () => {
    const days = monthDays(new Date(2026, 10, 1, 0, 0));
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-11-30');
  });

  it('lists 28 days for February in a common year and 29 in a leap year', () => {
    expect(monthDays(new Date(2026, 1, 10))).toHaveLength(28);
    expect(monthDays(new Date(2028, 1, 10))).toHaveLength(29);
    expect(monthDays(new Date(2028, 1, 10))[28]).toBe('2028-02-29');
  });

  it('keeps every day across a DST change (March and October)', () => {
    const march = monthDays(new Date(2026, 2, 15));
    expect(new Set(march).size).toBe(31);
    expect(march).toContain('2026-03-29');
    expect(march).toContain('2026-03-30');
    const october = monthDays(new Date(2026, 9, 15));
    expect(october).toContain('2026-10-25');
    expect(october).toContain('2026-10-26');
  });
});

describe('leadingBlanks', () => {
  it('is 0 for a month starting on Monday', () => {
    // 2026-06-01 is a Monday.
    expect(leadingBlanks(new Date(2026, 5, 20))).toBe(0);
  });

  it('is 6 for a month starting on Sunday', () => {
    // 2026-11-01 is a Sunday.
    expect(leadingBlanks(new Date(2026, 10, 20))).toBe(6);
  });

  it('is 3 for October 2026 (starts on Thursday)', () => {
    expect(leadingBlanks(new Date(2026, 9, 31))).toBe(3);
  });
});

describe('monthRange', () => {
  it('gives the first and last day key of the month', () => {
    expect(monthRange(new Date(2026, 9, 11))).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthRange(new Date(2028, 1, 1))).toEqual({ first: '2028-02-01', last: '2028-02-29' });
  });
});

describe('month names', () => {
  it('has 12 nominative and 12 genitive names', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES_GENITIVE).toHaveLength(12);
    expect(MONTH_NAMES[9]).toBe('Październik');
    expect(MONTH_NAMES_GENITIVE[9]).toBe('października');
  });
});

describe('formatDuration', () => {
  it('shows minutes only below an hour', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('shows whole hours without minutes', () => {
    expect(formatDuration(120)).toBe('2 godz.');
  });

  it('shows hours and minutes', () => {
    expect(formatDuration(750)).toBe('12 godz. 30 min');
  });
});

describe('musicDaysLabel', () => {
  it('uses "dzień" for one day and "dni" otherwise', () => {
    expect(musicDaysLabel(1)).toBe('1 dzień z muzyką');
    expect(musicDaysLabel(0)).toBe('0 dni z muzyką');
    expect(musicDaysLabel(2)).toBe('2 dni z muzyką');
    expect(musicDaysLabel(5)).toBe('5 dni z muzyką');
    expect(musicDaysLabel(22)).toBe('22 dni z muzyką');
  });
});

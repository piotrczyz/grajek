import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backdateDays, BACKDATE_DAYS, dayKey, WEEKDAY_GENITIVE, WEEKDAY_LABELS, weekDays, weekdayIndex } from './week.ts';

describe('dayKey', () => {
  it('formats the local date with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });

  it('maps a time just after local midnight to the local date', () => {
    expect(dayKey(new Date(2026, 9, 12, 0, 5))).toBe('2026-10-12');
  });

  describe('in Europe/Warsaw', () => {
    beforeAll(() => {
      vi.stubEnv('TZ', 'Europe/Warsaw');
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('uses the local date, not the UTC one, just after midnight', () => {
      // 2026-10-11 22:05 UTC is 2026-10-12 00:05 in Warsaw (CEST, UTC+2).
      const justAfterMidnight = new Date(Date.UTC(2026, 9, 11, 22, 5));
      expect(justAfterMidnight.getTimezoneOffset()).toBe(-120);
      expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-10-11');
      expect(dayKey(justAfterMidnight)).toBe('2026-10-12');
    });
  });
});

describe('weekDays', () => {
  const week = [
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
  ];

  it('returns Monday to Sunday when called on a Monday', () => {
    expect(weekDays(new Date(2026, 9, 5, 0, 0))).toEqual(week);
  });

  it('returns the same week when called on a Sunday late evening', () => {
    expect(weekDays(new Date(2026, 9, 11, 23, 59))).toEqual(week);
  });

  it('crosses a month boundary', () => {
    expect(weekDays(new Date(2026, 10, 1, 12, 0))).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});

describe('WEEKDAY_LABELS', () => {
  it('lists the Polish weekdays Monday first', () => {
    expect(WEEKDAY_LABELS.map((label) => label.short)).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
    expect(WEEKDAY_LABELS[0].full).toBe('Poniedziałek');
    expect(WEEKDAY_LABELS[6].full).toBe('Niedziela');
  });
});

describe('backdateDays', () => {
  it('returns today first, then up to 3 days back', () => {
    expect(BACKDATE_DAYS).toBe(3);
    expect(backdateDays(new Date(2026, 9, 7, 17, 0))).toEqual([
      '2026-10-07',
      '2026-10-06',
      '2026-10-05',
      '2026-10-04',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(backdateDays(new Date(2026, 10, 2, 0, 5))).toEqual([
      '2026-11-02',
      '2026-11-01',
      '2026-10-31',
      '2026-10-30',
    ]);
  });

  describe('in Europe/Warsaw', () => {
    beforeAll(() => {
      vi.stubEnv('TZ', 'Europe/Warsaw');
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('never skips or repeats a day across the DST change', () => {
      // CEST ends on 2026-10-25 at 03:00; 2026-10-26 00:30 is already CET.
      const justAfterMidnight = new Date(2026, 9, 26, 0, 30);
      expect(justAfterMidnight.getTimezoneOffset()).toBe(-60);
      expect(backdateDays(justAfterMidnight)).toEqual([
        '2026-10-26',
        '2026-10-25',
        '2026-10-24',
        '2026-10-23',
      ]);
    });
  });
});

describe('weekdayIndex and WEEKDAY_GENITIVE', () => {
  it('maps a day key to its weekday, Monday = 0', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0);
    expect(weekdayIndex('2026-10-07')).toBe(2);
    expect(weekdayIndex('2026-10-11')).toBe(6);
  });

  it('lists the genitive weekday names Monday first', () => {
    expect(WEEKDAY_GENITIVE).toEqual([
      'poniedziałku',
      'wtorku',
      'środy',
      'czwartku',
      'piątku',
      'soboty',
      'niedzieli',
    ]);
    expect(WEEKDAY_GENITIVE[weekdayIndex('2026-10-06')]).toBe('wtorku');
  });
});

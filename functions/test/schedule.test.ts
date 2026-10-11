import { describe, expect, it } from 'vitest';
import { isoWeekday, isValidTimeZone, localDay, nextReminderAt } from '../src/reminders/schedule.js';

const WARSAW = 'Europe/Warsaw';

describe('localDay and isoWeekday', () => {
  it('gives the local date in the device zone, not the UTC one', () => {
    // 23:30 UTC on Sunday is already Monday 01:30 in Warsaw (CEST).
    expect(localDay(new Date('2026-10-11T23:30:00Z'), WARSAW)).toBe('2026-10-12');
    expect(localDay(new Date('2026-10-11T23:30:00Z'), 'America/New_York')).toBe('2026-10-11');
  });

  it('numbers weekdays ISO-style, Monday = 1 .. Sunday = 7', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-17')).toBe(6);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isValidTimeZone(WARSAW)).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('nextReminderAt', () => {
  const everyDay17 = { '1': '17:00', '2': '17:00', '3': '17:00', '4': '17:00', '5': '17:00', '6': '17:00', '7': '17:00' };

  it('returns today at the local time when it is still ahead', () => {
    // Monday 2026-10-12, 10:00 Warsaw (CEST, UTC+2).
    const next = nextReminderAt(everyDay17, WARSAW, new Date('2026-10-12T08:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-12T15:00:00.000Z');
  });

  it('returns tomorrow when today\'s time has passed', () => {
    const next = nextReminderAt(everyDay17, WARSAW, new Date('2026-10-12T16:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });

  it('is strictly after: exactly at the reminder instant it moves to the next day', () => {
    const next = nextReminderAt(everyDay17, WARSAW, new Date('2026-10-12T15:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });

  it('skips weekdays without a time and uses each weekday\'s own time', () => {
    // Monday afternoon; only Wednesday (3) 16:30 and Saturday (6) 10:00 are set.
    const times = { '3': '16:30', '6': '10:00' };
    const next = nextReminderAt(times, WARSAW, new Date('2026-10-12T16:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-14T14:30:00.000Z');
    const after = nextReminderAt(times, WARSAW, new Date('2026-10-14T15:00:00Z'));
    expect(after?.toISOString()).toBe('2026-10-17T08:00:00.000Z');
  });

  it('finds the same weekday one week ahead when it is the only day and has passed', () => {
    const next = nextReminderAt({ '1': '17:00' }, WARSAW, new Date('2026-10-12T16:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-19T15:00:00.000Z');
  });

  it('returns null for empty times', () => {
    expect(nextReminderAt({}, WARSAW, new Date('2026-10-12T08:00:00Z'))).toBeNull();
  });

  it('follows the winter offset after the autumn change', () => {
    // Monday 2026-10-26 is CET (UTC+1).
    const next = nextReminderAt(everyDay17, WARSAW, new Date('2026-10-26T08:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-26T16:00:00.000Z');
  });

  it('maps a wall time in the spring-forward gap one hour later (2026-03-29 02:30 -> 03:30 CEST)', () => {
    const next = nextReminderAt({ '7': '02:30' }, WARSAW, new Date('2026-03-28T23:00:00Z'));
    expect(next?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('maps an ambiguous autumn wall time to the earlier instant (2026-10-25 02:30 CEST)', () => {
    const next = nextReminderAt({ '7': '02:30' }, WARSAW, new Date('2026-10-24T22:00:00Z'));
    expect(next?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('works in a non-Warsaw zone (America/New_York, EDT then EST)', () => {
    const ny = 'America/New_York';
    expect(nextReminderAt(everyDay17, ny, new Date('2026-10-12T12:00:00Z'))?.toISOString()).toBe(
      '2026-10-12T21:00:00.000Z',
    );
    // 2026-11-01 ends DST in New York: 17:00 is then UTC-5.
    expect(nextReminderAt(everyDay17, ny, new Date('2026-11-02T12:00:00Z'))?.toISOString()).toBe(
      '2026-11-02T22:00:00.000Z',
    );
  });

  it('uses the device\'s local date, not the UTC date, to start the walk', () => {
    // 23:30 UTC Sunday = Monday 01:30 Warsaw; Monday-only 07:00 is today in Warsaw.
    const next = nextReminderAt({ '1': '07:00' }, WARSAW, new Date('2026-10-11T23:30:00Z'));
    expect(next?.toISOString()).toBe('2026-10-12T05:00:00.000Z');
  });
});

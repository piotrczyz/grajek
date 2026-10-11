import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOT,
  PLACE_MAX_LENGTH,
  slotFor,
  validatePracticeTime,
  weekdayOf,
  type NewPracticeTime,
  type Weekday,
} from './practiceTime.ts';

const withDefault = (time: string, place: string): NewPracticeTime => ({
  default: { time, place },
  overrides: {},
});

describe('validatePracticeTime', () => {
  it('accepts a valid default slot and trims the place', () => {
    expect(validatePracticeTime(withDefault('07:05', '  U babci  '))).toEqual({
      ok: true,
      value: { default: { time: '07:05', place: 'U babci' }, overrides: {} },
    });
  });

  it('accepts the edges of the day', () => {
    expect(validatePracticeTime(withDefault('00:00', 'W domu')).ok).toBe(true);
    expect(validatePracticeTime(withDefault('23:59', 'W domu')).ok).toBe(true);
  });

  it.each(['24:00', '7:5', '7:05', '12:60', '', 'noon'])('rejects time %j', (time) => {
    expect(validatePracticeTime(withDefault(time, 'W domu'))).toEqual({ ok: false, reason: 'time-invalid' });
  });

  it('rejects an empty or whitespace place', () => {
    expect(validatePracticeTime(withDefault('17:00', '   '))).toEqual({ ok: false, reason: 'place-empty' });
  });

  it('rejects a place longer than the limit, counted after trimming', () => {
    const exact = 'a'.repeat(PLACE_MAX_LENGTH);
    expect(validatePracticeTime(withDefault('17:00', ` ${exact} `)).ok).toBe(true);
    expect(validatePracticeTime(withDefault('17:00', `${exact}a`))).toEqual({
      ok: false,
      reason: 'place-too-long',
    });
  });

  it('validates and trims every override', () => {
    const input: NewPracticeTime = {
      default: DEFAULT_SLOT,
      overrides: { 3: { time: '15:00', place: ' Szkoła ' } },
    };
    expect(validatePracticeTime(input)).toEqual({
      ok: true,
      value: { default: DEFAULT_SLOT, overrides: { 3: { time: '15:00', place: 'Szkoła' } } },
    });

    expect(
      validatePracticeTime({ default: DEFAULT_SLOT, overrides: { 6: { time: '25:00', place: 'Dom' } } }),
    ).toEqual({ ok: false, reason: 'time-invalid' });
    expect(
      validatePracticeTime({ default: DEFAULT_SLOT, overrides: { 6: { time: '10:00', place: '' } } }),
    ).toEqual({ ok: false, reason: 'place-empty' });
  });

  it.each(['0', '8', 'mon', '1.5'])('rejects override key %j', (key) => {
    const overrides = { [key]: { time: '10:00', place: 'Dom' } } as unknown as NewPracticeTime['overrides'];
    expect(validatePracticeTime({ default: DEFAULT_SLOT, overrides })).toEqual({
      ok: false,
      reason: 'weekday-invalid',
    });
  });
});

describe('weekdayOf and slotFor', () => {
  // 2026-10-12 is a Monday.
  const monday = new Date(2026, 9, 12, 10, 0);
  const wednesday = new Date(2026, 9, 14, 10, 0);
  const sunday = new Date(2026, 9, 18, 23, 30);

  it('maps the local date to ISO weekdays, Sunday = 7', () => {
    expect(weekdayOf(monday)).toBe(1);
    expect(weekdayOf(wednesday)).toBe(3);
    expect(weekdayOf(sunday)).toBe(7);
  });

  const practiceTime = {
    default: { time: '17:00', place: 'W domu' },
    overrides: { 3: { time: '15:00', place: 'Szkoła' }, 7: { time: '10:00', place: 'U babci' } } as Partial<
      Record<Weekday, { time: string; place: string }>
    >,
  };

  it('returns the default on a weekday without an override', () => {
    expect(slotFor(practiceTime, monday)).toEqual({ time: '17:00', place: 'W domu' });
  });

  it('returns the override on a weekday with one, including Sunday', () => {
    expect(slotFor(practiceTime, wednesday)).toEqual({ time: '15:00', place: 'Szkoła' });
    expect(slotFor(practiceTime, sunday)).toEqual({ time: '10:00', place: 'U babci' });
  });
});

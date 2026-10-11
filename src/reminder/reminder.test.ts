import { describe, expect, it } from 'vitest';
import type { PracticeTime } from '../practice-time/index.ts';
import { buildReminderPayload, isReminderDays, reminderWeekdays, samePayload } from './reminder.ts';

const PORA: PracticeTime = {
  default: { time: '17:00', place: 'W domu' },
  overrides: { 3: { time: '15:30', place: 'U babci' }, 6: { time: '10:00', place: 'Szkoła' } },
  updatedAt: '2026-10-01T10:00:00.000Z',
};
// Monday, local time.
const NOW = new Date(2026, 9, 12, 9, 0);
const ZONE = 'Europe/Warsaw';

describe('buildReminderPayload', () => {
  it('has one time per weekday, using that weekday\'s override', () => {
    const payload = buildReminderPayload(PORA, { mode: 'all' }, false, NOW, ZONE);
    expect(payload).toEqual({
      timezone: ZONE,
      times: { '1': '17:00', '2': '17:00', '3': '15:30', '4': '17:00', '5': '17:00', '6': '10:00', '7': '17:00' },
      practicedOn: null,
    });
  });

  it('never carries the place', () => {
    const payload = buildReminderPayload(PORA, { mode: 'all' }, true, NOW, ZONE);
    expect(JSON.stringify(payload)).not.toMatch(/domu|babci|Szkoła/);
  });

  it('limits the times to the chosen weekdays', () => {
    const payload = buildReminderPayload(PORA, { mode: 'chosen', weekdays: [6, 1] }, false, NOW, ZONE);
    expect(payload.times).toEqual({ '1': '17:00', '6': '10:00' });
  });

  it('has no times when no Pora is saved, or no day is chosen', () => {
    expect(buildReminderPayload(null, { mode: 'all' }, false, NOW, ZONE).times).toEqual({});
    expect(buildReminderPayload(PORA, { mode: 'chosen', weekdays: [] }, false, NOW, ZONE).times).toEqual({});
  });

  it('sets practicedOn to today\'s local date only when practiced today', () => {
    expect(buildReminderPayload(PORA, { mode: 'all' }, true, NOW, ZONE).practicedOn).toBe('2026-10-12');
    expect(buildReminderPayload(PORA, { mode: 'all' }, false, NOW, ZONE).practicedOn).toBeNull();
  });
});

describe('samePayload', () => {
  const a = buildReminderPayload(PORA, { mode: 'all' }, false, NOW, ZONE);

  it('is true for equal payloads regardless of key order', () => {
    const reordered = { ...a, times: Object.fromEntries(Object.entries(a.times).reverse()) };
    expect(samePayload(a, reordered)).toBe(true);
  });

  it('notices a changed time, day set, date or zone', () => {
    expect(samePayload(a, { ...a, times: { ...a.times, '1': '18:00' } })).toBe(false);
    expect(samePayload(a, { ...a, times: { '1': '17:00' } })).toBe(false);
    expect(samePayload(a, { ...a, practicedOn: '2026-10-12' })).toBe(false);
    expect(samePayload(a, { ...a, timezone: 'Europe/London' })).toBe(false);
  });
});

describe('reminder days', () => {
  it('lists the reminder weekdays Monday first', () => {
    expect(reminderWeekdays({ mode: 'all' })).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(reminderWeekdays({ mode: 'chosen', weekdays: [7, 2] })).toEqual([2, 7]);
  });

  it('recognises a stored setting', () => {
    expect(isReminderDays({ mode: 'all' })).toBe(true);
    expect(isReminderDays({ mode: 'chosen', weekdays: [1, 7] })).toBe(true);
    expect(isReminderDays({ mode: 'chosen', weekdays: [8] })).toBe(false);
    expect(isReminderDays({ mode: 'sometimes' })).toBe(false);
    expect(isReminderDays(undefined)).toBe(false);
  });
});

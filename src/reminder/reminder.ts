/**
 * The daily reminder (roadmap S-08): which weekdays remind, and the payload
 * the phone sends to the notification server. Pure types and functions.
 *
 * The payload carries only the time zone, one `HH:MM` per reminder weekday and
 * today's date when a practice was logged today. Never the place, the name or
 * any practice details (ADR 0001, NFR Prywatność).
 */
import { slotFor, WEEKDAYS, type PracticeTime, type Weekday } from '../practice-time/index.ts';
import { dayKey } from '../practice/week.ts';

/** On which weekdays a reminder may come. */
export type ReminderDays = { mode: 'all' } | { mode: 'chosen'; weekdays: Weekday[] };

export const DEFAULT_REMINDER_DAYS: ReminderDays = { mode: 'all' };

/** ISO weekday as a map key, `'1'` = Monday. */
export type WeekdayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';

/** The body of `PUT /api/devices/{id}/reminder`. */
export interface ReminderPayload {
  timezone: string;
  times: Partial<Record<WeekdayKey, string>>;
  practicedOn: string | null;
}

/** The weekdays that remind, Monday first. */
export function reminderWeekdays(days: ReminderDays): Weekday[] {
  if (days.mode === 'all') return [...WEEKDAYS];
  return WEEKDAYS.filter((day) => days.weekdays.includes(day));
}

/** A local date that falls on ISO `weekday` (2024-01-01 was a Monday). */
function dateOnWeekday(weekday: Weekday): Date {
  return new Date(2024, 0, weekday);
}

export function buildReminderPayload(
  practiceTime: PracticeTime | null,
  days: ReminderDays,
  practicedToday: boolean,
  now: Date,
  timezone: string,
): ReminderPayload {
  const times: ReminderPayload['times'] = {};
  if (practiceTime) {
    for (const weekday of reminderWeekdays(days)) {
      // Only the time leaves the device; the place stays here.
      times[String(weekday) as WeekdayKey] = slotFor(practiceTime, dateOnWeekday(weekday)).time;
    }
  }
  return { timezone, times, practicedOn: practicedToday ? dayKey(now) : null };
}

export function samePayload(a: ReminderPayload, b: ReminderPayload): boolean {
  if (a.timezone !== b.timezone || a.practicedOn !== b.practicedOn) return false;
  const keys = (p: ReminderPayload) => Object.keys(p.times).sort().join(',');
  if (keys(a) !== keys(b)) return false;
  return (Object.keys(a.times) as WeekdayKey[]).every((key) => a.times[key] === b.times[key]);
}

export function isReminderDays(value: unknown): value is ReminderDays {
  if (typeof value !== 'object' || value === null) return false;
  const days = value as { mode?: unknown; weekdays?: unknown };
  if (days.mode === 'all') return true;
  return (
    days.mode === 'chosen' &&
    Array.isArray(days.weekdays) &&
    days.weekdays.every((day) => WEEKDAYS.includes(day as Weekday))
  );
}

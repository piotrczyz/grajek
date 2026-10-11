import type { ReminderState, ReminderTimes, WeekdayKey } from '../devices/types.js';
import { isValidTimeZone } from './schedule.js';

const WEEKDAY_KEYS = new Set<string>(['1', '2', '3', '4', '5', '6', '7']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TIMEZONE_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TIMEZONE_LENGTH) {
    return null;
  }
  return isValidTimeZone(value) ? value : null;
}

function parseTimes(value: unknown): ReminderTimes | null {
  if (!isRecord(value)) {
    return null;
  }
  const times: ReminderTimes = {};
  for (const [key, time] of Object.entries(value)) {
    if (!WEEKDAY_KEYS.has(key) || typeof time !== 'string' || !TIME.test(time)) {
      return null;
    }
    times[key as WeekdayKey] = time;
  }
  return times;
}

/** A real calendar date in `YYYY-MM-DD`, e.g. not `2026-02-30`. */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = DAY.exec(value);
  if (!match) {
    return false;
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Accepts `{ timezone, times, practicedOn }` strictly and returns only those
 * fields. Unknown top-level fields are dropped; any invalid value is `null`.
 */
export function parseReminder(body: unknown): ReminderState | null {
  if (!isRecord(body)) {
    return null;
  }
  const timezone = parseTimeZone(body.timezone);
  const times = parseTimes(body.times);
  const { practicedOn } = body;
  if (!timezone || !times) {
    return null;
  }
  if (practicedOn !== null && !isValidDay(practicedOn)) {
    return null;
  }
  return { timezone, times, practicedOn };
}

/**
 * Zone-aware local-time helpers for the daily reminder (roadmap S-08).
 *
 * Dependency-free: everything goes through `Intl.DateTimeFormat`, which knows
 * the IANA zones and their daylight-saving rules.
 */
import type { ReminderTimes, WeekdayKey } from '../devices/types.js';

const DAY_MS = 86_400_000;

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, f);
  }
  return f;
}

function wallTime(at: Date, timezone: string): WallTime & { second: number } {
  const parts: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(at)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Offset of `timezone` from UTC at the instant `at`, in milliseconds. */
function offsetMs(at: Date, timezone: string): number {
  const w = wallTime(at, timezone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

function sameWall(at: number, timezone: string, target: WallTime): boolean {
  const w = wallTime(new Date(at), timezone);
  return (
    w.year === target.year &&
    w.month === target.month &&
    w.day === target.day &&
    w.hour === target.hour &&
    w.minute === target.minute
  );
}

/**
 * The UTC instant of a local wall time in `timezone`. A wall time that does
 * not exist (spring-forward gap) maps to the instant one hour later in wall
 * terms (02:30 -> 03:30); an ambiguous one (autumn overlap) maps to the
 * earlier instant.
 */
function wallToInstant(target: WallTime, timezone: string): number {
  const guess = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const before = offsetMs(new Date(guess - DAY_MS), timezone);
  const after = offsetMs(new Date(guess + DAY_MS), timezone);
  const candidates = [guess - before, guess - after].filter((t) => sameWall(t, timezone, target));
  if (candidates.length > 0) {
    return Math.min(...candidates);
  }
  // Gap: the wall time is skipped; apply the offset in force before the change.
  return guess - before;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** The local calendar date (`YYYY-MM-DD`) of `at` in `timezone`. */
export function localDay(at: Date, timezone: string): string {
  const w = wallTime(at, timezone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** ISO weekday of a `YYYY-MM-DD` date: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(day: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = day.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js === 0 ? 7 : js) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/**
 * The first reminder instant strictly after `after`, walking local dates from
 * the local date of `after` for 8 days; `null` when `times` is empty.
 */
export function nextReminderAt(times: ReminderTimes, timezone: string, after: Date): Date | null {
  const start = localDay(after, timezone);
  const [y, m, d] = start.split('-').map(Number);
  for (let i = 0; i < 8; i += 1) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    const time = times[String(isoWeekday(day)) as WeekdayKey];
    if (!time) {
      continue;
    }
    const [hour, minute] = time.split(':').map(Number);
    const instant = wallToInstant(
      { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute },
      timezone,
    );
    if (instant > after.getTime()) {
      return new Date(instant);
    }
  }
  return null;
}

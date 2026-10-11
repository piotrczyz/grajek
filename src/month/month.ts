/**
 * Month helpers for the month view, always in the device's local time.
 *
 * Dates are built from local parts (`new Date(y, m, d)`) and turned into day
 * keys with `dayKey`, never with `toISOString()` (UTC would shift days around
 * midnight). Weeks run Monday to Sunday, like the week view.
 */
import { dayKey } from '../practice/week.ts';

/** Number of days in the month containing `now`. */
function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/** Day keys of the month containing `now`, the 1st to the last day. */
export function monthDays(now: Date): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  return Array.from({ length: daysInMonth(now) }, (_, i) => dayKey(new Date(year, month, i + 1)));
}

/** Empty cells before the 1st in a Monday-first week row (0-6). */
export function leadingBlanks(now: Date): number {
  return (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
}

/** First and last day key of the month containing `now`. */
export function monthRange(now: Date): { first: string; last: string } {
  const days = monthDays(now);
  return { first: days[0], last: days[days.length - 1] };
}

/** Month names in the nominative, for the heading ("Październik 2026"). */
export const MONTH_NAMES: readonly string[] = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

/** Month names in the genitive, for day labels ("12 października"). */
export const MONTH_NAMES_GENITIVE: readonly string[] = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

/** Practice time in hours and minutes: "45 min", "2 godz.", "12 godz. 30 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} godz.`;
  return `${hours} godz. ${rest} min`;
}

/** "1 dzień z muzyką", otherwise "N dni z muzyką". */
export function musicDaysLabel(count: number): string {
  return count === 1 ? '1 dzień z muzyką' : `${count} dni z muzyką`;
}

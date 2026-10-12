/**
 * Calendar helpers for practice sessions, always in the device's local time.
 *
 * A day key is the local date `YYYY-MM-DD`, built from local date parts and
 * never from `toISOString()` (which is UTC and would shift sessions logged
 * just after local midnight to the previous day). Weeks run Monday to Sunday.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** The local calendar date of `date` as `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The 7 day keys of the Monday-to-Sunday week containing `now`, Monday first. */
export function weekDays(now: Date): string[] {
  const sinceMonday = (now.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    // Built from local parts so DST changes never skip or repeat a day.
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + i)),
  );
}

export interface WeekdayLabel {
  /** Short label shown in the week row. */
  short: string;
  /** Full Polish name, used for accessible labels. */
  full: string;
}

/** Monday first, matching `weekDays`. */
export const WEEKDAY_LABELS: readonly WeekdayLabel[] = [
  { short: 'Pn', full: 'Poniedziałek' },
  { short: 'Wt', full: 'Wtorek' },
  { short: 'Śr', full: 'Środa' },
  { short: 'Cz', full: 'Czwartek' },
  { short: 'Pt', full: 'Piątek' },
  { short: 'So', full: 'Sobota' },
  { short: 'Nd', full: 'Niedziela' },
];

/** How many days back a session may be logged (Ćwiczenie wstecz). */
export const BACKDATE_DAYS = 3;

/**
 * The day keys a session may be logged for: today first, then 1 to
 * `BACKDATE_DAYS` days back. Built from local parts, so DST changes and month
 * boundaries never skip or repeat a day.
 */
export function backdateDays(now: Date): string[] {
  return Array.from({ length: BACKDATE_DAYS + 1 }, (_, i) =>
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)),
  );
}

/** Weekday of a day key, 0 = Monday (matching `WEEKDAY_LABELS`). */
export function weekdayIndex(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return (new Date(year, month - 1, date).getDay() + 6) % 7;
}

/** Weekday names in the genitive ("do wtorku"), Monday first. */
export const WEEKDAY_GENITIVE: readonly string[] = [
  'poniedziałku',
  'wtorku',
  'środy',
  'czwartku',
  'piątku',
  'soboty',
  'niedzieli',
];

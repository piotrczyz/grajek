import type { PushPayload } from '../devices/types.js';

/**
 * The daily reminder lines (roadmap S-08, NFR Powiadomienia): short,
 * encouraging, no pressure, nothing personal (ADR 0001).
 */
export const REMINDER_MESSAGES = [
  'Pora na chwilę z instrumentem. Dasz radę!',
  'Twój instrument już czeka. Zagrasz parę minut?',
  'Kilka minut grania i dzień brzmi lepiej.',
  'Czas na małą muzyczną przygodę!',
] as const;

export const REMINDER_TAG = 'grajek-reminder';

/** The reminder for a local day; the line is picked deterministically by the date. */
export function reminderPayload(day: string): PushPayload {
  const sum = [...day].reduce((total, ch) => total + (ch >= '0' && ch <= '9' ? Number(ch) : 0), 0);
  return {
    title: 'Grajek',
    body: REMINDER_MESSAGES[sum % REMINDER_MESSAGES.length],
    tag: REMINDER_TAG,
  };
}

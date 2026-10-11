/** Polish texts of the Pora ćwiczeń card shown to the student (Uczeń). */
import type { Weekday } from './practiceTime.ts';

export { RETRY_MESSAGE } from '../profile/copy.ts';

export const SET_PRACTICE_TIME = 'Ustal porę ćwiczeń';
export const TODAY = 'Dziś:';
export const CHANGE = 'Zmień';
export const TIME_LABEL = 'O której ćwiczysz?';
export const PLACE_LABEL = 'Gdzie ćwiczysz?';
export const OTHER_DAYS = 'Inna pora w wybrane dni';
export const SAVE = 'Zapisz';
export const CANCEL = 'Anuluj';

/** Short toggle label and accessible full name per ISO weekday. */
export const DAY_LABELS: Record<Weekday, { short: string; full: string }> = {
  1: { short: 'Pn', full: 'poniedziałek' },
  2: { short: 'Wt', full: 'wtorek' },
  3: { short: 'Śr', full: 'środa' },
  4: { short: 'Cz', full: 'czwartek' },
  5: { short: 'Pt', full: 'piątek' },
  6: { short: 'Sb', full: 'sobota' },
  7: { short: 'Nd', full: 'niedziela' },
};

export const dayTimeLabel = (day: Weekday) => `O której ćwiczysz – ${DAY_LABELS[day].full}?`;
export const dayPlaceLabel = (day: Weekday) => `Gdzie ćwiczysz – ${DAY_LABELS[day].full}?`;

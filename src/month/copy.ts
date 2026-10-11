/** Polish, encouraging texts of the month view. Nothing here mentions missed days. */
import { MUSIC_DAY_LABEL, TODAY_LABEL } from '../practice/copy.ts';
import { RETRY_MESSAGE } from '../profile/copy.ts';

export { RETRY_MESSAGE };

export const MONTH_TOGGLE = 'Mój miesiąc';
export const MONTH_LIST_LABEL = 'Ten miesiąc';
export const monthCounter = (count: number) => `Dni z muzyką w tym miesiącu: ${count}`;
export const LIFETIME_PREFIX = 'Razem:';
export const LIFETIME_EMPTY = 'Tu zbierzesz wszystkie swoje Dni z muzyką. Pierwszy już niedługo!';
export const RETRY_BUTTON = 'Spróbuj jeszcze raz';

/** Accessible name of one day: "12 października: Dzień z muzyką (dziś)". */
export function monthDayLabel(date: string, music: boolean, isToday: boolean): string {
  return [music ? `${date}: ${MUSIC_DAY_LABEL}` : date, isToday ? TODAY_LABEL : null].filter(Boolean).join(' ');
}

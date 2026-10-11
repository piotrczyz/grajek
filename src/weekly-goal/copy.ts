/**
 * Polish texts of the Cel tygodniowy card shown to the student (Uczeń).
 *
 * Encouraging only: nothing here talks about a missed day, a failed week or
 * anything lost (a test enforces it). A new week simply starts from zero.
 */
export { RETRY_MESSAGE } from '../profile/copy.ts';

export const SET_GOAL = 'Ustal cel tygodnia';
export const GOAL_QUESTION = 'Ile dni w tygodniu chcesz grać?';
export const SUGGESTED_HINT = 'dobry start';
export const SPARE_DAY_NOTE = 'Jeden dzień zawsze zostaje na zapas.';
export const REACHED = 'Cel osiągnięty!';
export const GOAL_LABEL = 'Cel tygodnia';
export const CHANGE = 'Zmień';
/** Not "Zapisz": the log panel and the practice-time editor may show their own "Zapisz" on the same screen. */
export const SAVE_GOAL = 'Ustaw cel';
export const CANCEL = 'Anuluj';

/** "1 dzień", "3 dni": the unit shown on a goal option. */
export const daysUnit = (days: number) => (days === 1 ? 'dzień' : 'dni');

/** Accessible name of a goal option, e.g. "4 dni". */
export const goalOptionLabel = (days: number) => `${days} ${daysUnit(days)}`;

/** "3 z 4 dni" (with a goal of 1: "0 z 1 dnia"). */
export const progressLabel = (count: number, goal: number) =>
  `${count} z ${goal} ${goal === 1 ? 'dnia' : 'dni'}`;

/** "W tym tygodniu: 4 dni z muzyką". */
export const reachedDays = (count: number) => `W tym tygodniu: ${count} ${daysUnit(count)} z muzyką`;

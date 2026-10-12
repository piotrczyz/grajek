/** Polish, encouraging texts of the practice log (Ćwiczenie). */
import { RETRY_MESSAGE } from '../profile/copy.ts';
import { WEEKDAY_GENITIVE, weekdayIndex } from './week.ts';

export const LOG_BUTTON = 'Zagrałem!';
export const PANEL_HEADING = 'Ile grałeś?';
export const INSTRUMENT_LABEL = 'Na czym grałeś?';
export const minutesLabel = (minutes: number) => `${minutes} min`;
export const MORE_TOGGLE = 'Dodaj więcej';
export const NOTE_LABEL = 'Nad czym pracowałem?';
export const EMOJI_LABEL = 'Jak było?';
export const SAVE_BUTTON = 'Zapisz';
export const CANCEL_BUTTON = 'Anuluj';
export const SAVED_MESSAGE = 'Super! Zapisane.';
export const SAVE_FAILED_MESSAGE = RETRY_MESSAGE;
export const WEEK_LABEL = 'Ten tydzień';
export const MUSIC_DAY_LABEL = 'Dzień z muzyką';
export const TODAY_LABEL = '(dziś)';
export const DAY_LABEL = 'Kiedy grałeś?';
export const TODAY_CHIP = 'Dziś';
export const YESTERDAY_CHIP = 'Wczoraj';
export const DAY_BEFORE_CHIP = 'Przedwczoraj';
/** Shown after saving for a past day, e.g. "Super! Dopisane do wtorku.". */
export const backdatedMessage = (day: string) => `Super! Dopisane do ${WEEKDAY_GENITIVE[weekdayIndex(day)]}.`;
/** Accessible name of a tappable empty past day in the week, e.g. "Środa: dopisz granie". */
export const logDayHint = (fullWeekday: string) => `${fullWeekday}: dopisz granie`;

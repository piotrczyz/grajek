/** Polish, encouraging texts of the Progress Card (Karta postępu). */
import { RETRY_MESSAGE } from '../profile/copy.ts';

export const SHARE_BUTTON = 'Pokaż rodzinie';
export const CARD_TITLE = 'Grajek';
export const CARD_CHEER = 'Ćwiczę dla siebie!';
export const SHARE_TITLE = 'Moja karta postępu';
export const SHARE_TEXT = 'Zobacz, jak mi idzie z muzyką!';
export const DOWNLOADED_MESSAGE = 'Obrazek zapisany.';
export const SHARE_FAILED_MESSAGE = RETRY_MESSAGE;
export const CARD_FILE_NAME = 'karta-postepu.png';

/** "1 dzień z muzyką w tym tygodniu", otherwise "N dni z muzyką w tym tygodniu". */
export function musicDaysHeadline(count: number): string {
  return `${count} ${count === 1 ? 'dzień' : 'dni'} z muzyką w tym tygodniu`;
}

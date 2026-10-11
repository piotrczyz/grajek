import { WEEKDAY_LABELS } from '../practice/week.ts';
import { instrumentIcon } from '../profile/instruments.ts';
import { CARD_CHEER, CARD_TITLE, musicDaysHeadline } from './copy.ts';

/**
 * What the card is built from. Deliberately has no name field: the card must not
 * carry personal data (PRD FR-001 challenge, FR-008).
 */
export interface CardInput {
  /** The 7 day keys of the week, Monday first (see `weekDays`). */
  days: string[];
  /** Day keys with at least one practice session (Dzień z muzyką). */
  musicDays: ReadonlySet<string>;
  instrumentName: string;
}

export interface CardDay {
  short: string;
  music: boolean;
}

export interface CardModel {
  title: string;
  instrumentIcon: string;
  instrumentName: string;
  headline: string;
  /** 7 entries, Monday first. */
  week: CardDay[];
  cheer: string;
  musicDayCount: number;
}

/** The content of the Progress Card: only the student's own effort this week. */
export function buildCardModel({ days, musicDays, instrumentName }: CardInput): CardModel {
  const week = WEEKDAY_LABELS.map(({ short }, index) => ({
    short,
    music: index < days.length && musicDays.has(days[index]),
  }));
  const musicDayCount = week.filter((day) => day.music).length;
  return {
    title: CARD_TITLE,
    instrumentIcon: instrumentIcon(instrumentName),
    instrumentName,
    headline: musicDaysHeadline(musicDayCount),
    week,
    cheer: CARD_CHEER,
    musicDayCount,
  };
}

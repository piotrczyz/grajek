/**
 * Polish texts of the badges block shown to the student (Uczeń).
 *
 * Encouraging only: praise for effort and persistence, never talent, being
 * the best, winning, points, or anything lost or missed (a test enforces it).
 * Nothing here hints at badges not earned yet.
 */

export const NEW_BADGE = 'Nowa odznaka';
export const NEW_BADGES = 'Nowe odznaki';
export const DISMISS = 'Super!';
export const COLLECTION_TOGGLE = 'Moje odznaki';
export const COLLECTION_LABEL = 'Zdobyte odznaki';

/** Polish plural class of `n`: `one` (1), `few` (2-4, 22-24, … but not 12-14), `many` (the rest). */
function pluralClass(n: number): 'one' | 'few' | 'many' {
  if (n === 1) return 'one';
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'few';
  return 'many';
}

/** "1 odznaka", "3 odznaki", "5 odznak", "12 odznak". */
export const badgeCountLabel = (n: number) =>
  `${n} ${{ one: 'odznaka', few: 'odznaki', many: 'odznak' }[pluralClass(n)]}`;

/** The one-time message after badges were earned for history from before this version. */
export const retroSummary = (n: number) =>
  `Twoje dotychczasowe ćwiczenia przyniosły Ci ${n} ${
    { one: 'odznakę', few: 'odznaki', many: 'odznak' }[pluralClass(n)]
  }! Zajrzyj do kolekcji.`;

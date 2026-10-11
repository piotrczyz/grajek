import { describe, expect, it } from 'vitest';
import { BADGES } from './catalog.ts';
import * as copy from './copy.ts';

/** Talent, comparison, points, winning, losing or failure: never in a badge text. */
const FORBIDDEN_WORDING = /talent|zdoln|najlepsz|wygr|punkt|strac|porażk|przegap|niestety|lepszy od|ranking/i;

function allTexts(): string[] {
  const moduleTexts = Object.values(copy).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') {
      const build = value as (n: number) => string;
      return [1, 2, 3, 4, 5, 12, 15, 22].map((n) => build(n));
    }
    return [];
  });
  return [...moduleTexts, ...BADGES.flatMap((badge) => [badge.name, badge.praise])];
}

describe('badges copy', () => {
  it('never talks about talent, comparison, points or loss', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN_WORDING);
  });

  it('builds Polish plurals of the badge count', () => {
    expect(copy.badgeCountLabel(1)).toBe('1 odznaka');
    expect(copy.badgeCountLabel(2)).toBe('2 odznaki');
    expect(copy.badgeCountLabel(4)).toBe('4 odznaki');
    expect(copy.badgeCountLabel(5)).toBe('5 odznak');
    expect(copy.badgeCountLabel(12)).toBe('12 odznak');
    expect(copy.badgeCountLabel(14)).toBe('14 odznak');
    expect(copy.badgeCountLabel(22)).toBe('22 odznaki');
  });

  it('builds the retroactive summary', () => {
    expect(copy.retroSummary(1)).toBe('Twoje dotychczasowe ćwiczenia przyniosły Ci 1 odznakę! Zajrzyj do kolekcji.');
    expect(copy.retroSummary(3)).toBe('Twoje dotychczasowe ćwiczenia przyniosły Ci 3 odznaki! Zajrzyj do kolekcji.');
    expect(copy.retroSummary(7)).toBe('Twoje dotychczasowe ćwiczenia przyniosły Ci 7 odznak! Zajrzyj do kolekcji.');
  });
});

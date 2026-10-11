import { describe, expect, it } from 'vitest';
import * as copy from './copy.ts';

const FAILURE_WORDING = /porażk|nie udało|przegap|strac|niestety|nie zdąży|zawiod/i;

/** Every text the module can produce, with sample arguments for the builders. */
function allTexts(): string[] {
  return Object.values(copy).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') {
      const build = value as (...args: number[]) => string;
      return [0, 1, 2, 3, 4, 5, 6, 7].flatMap((n) => [build(n, 4), build(n, 1), build(n, 6)]);
    }
    return [];
  });
}

describe('weekly goal copy', () => {
  it('never talks about failure, missing or losing', () => {
    const texts = allTexts();
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) expect(text).not.toMatch(FAILURE_WORDING);
  });

  it('builds progress and reached texts in Polish', () => {
    expect(copy.progressLabel(3, 4)).toBe('3 z 4 dni');
    expect(copy.progressLabel(0, 4)).toBe('0 z 4 dni');
    expect(copy.progressLabel(0, 1)).toBe('0 z 1 dnia');
    expect(copy.reachedDays(4)).toBe('W tym tygodniu: 4 dni z muzyką');
    expect(copy.reachedDays(1)).toBe('W tym tygodniu: 1 dzień z muzyką');
    expect(copy.goalOptionLabel(1)).toBe('1 dzień');
    expect(copy.goalOptionLabel(5)).toBe('5 dni');
  });
});

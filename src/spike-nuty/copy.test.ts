import { describe, expect, it } from 'vitest';
import { plural, signedMs, summaryText } from './copy.ts';

describe('plural', () => {
  it('picks the Polish form', () => {
    const nuta = (n: number) => `${n} ${plural(n, 'nuta', 'nuty', 'nut')}`;
    expect([1, 2, 4, 5, 12, 14, 21, 22, 25, 0].map(nuta)).toEqual([
      '1 nuta',
      '2 nuty',
      '4 nuty',
      '5 nut',
      '12 nut',
      '14 nut',
      '21 nut',
      '22 nuty',
      '25 nut',
      '0 nut',
    ]);
  });
});

describe('signedMs', () => {
  it('writes the sign', () => {
    expect(signedMs(180.4)).toBe('+180 ms');
    expect(signedMs(-120)).toBe('\u2212120 ms');
    expect(signedMs(0.2)).toBe('0 ms');
  });
});

describe('summaryText', () => {
  const zero = { total: 10, good: 0, late: 0, early: 0, rhythm: 0, wrongPitch: 0, missing: 0, extra: 0 };

  it('lists only non-zero counts', () => {
    expect(summaryText({ ...zero, good: 8, late: 2, wrongPitch: 1, missing: 1, extra: 1 })).toBe(
      '8 z 10 nut dobrze, 2 za późno, 1 zła nuta, 1 brakująca, 1 dodatkowa',
    );
    expect(summaryText({ ...zero, good: 10 })).toBe('10 z 10 nut dobrze');
  });

  it('uses plural forms', () => {
    expect(
      summaryText({ ...zero, total: 15, good: 3, early: 1, rhythm: 2, wrongPitch: 5, missing: 2, extra: 3 }),
    ).toBe('3 z 15 nut dobrze, 1 za wcześnie, 2 złe długości, 5 złych nut, 2 brakujące, 3 dodatkowe');
    expect(summaryText({ ...zero, total: 1, good: 1 })).toBe('1 z 1 nuty dobrze');
  });
});

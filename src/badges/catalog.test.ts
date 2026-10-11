import { describe, expect, it } from 'vitest';
import { BADGES, badgeById } from './catalog.ts';

describe('badge catalog', () => {
  it('has 15 badges with unique ids in display order', () => {
    expect(BADGES).toHaveLength(15);
    expect(new Set(BADGES.map((badge) => badge.id)).size).toBe(15);
    expect(BADGES.map((badge) => badge.kind)).toEqual([
      ...Array<string>(4).fill('days'),
      ...Array<string>(6).fill('time'),
      ...Array<string>(4).fill('weeks'),
      'comeback',
    ]);
  });

  it('gives every badge a name, an icon and a praise line', () => {
    for (const badge of BADGES) {
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.praise.length).toBeGreaterThan(0);
    }
  });

  it('grows thresholds within each kind', () => {
    for (const kind of ['days', 'time', 'weeks'] as const) {
      const thresholds = BADGES.filter((badge) => badge.kind === kind).map((badge) => badge.threshold);
      expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    }
  });

  it('finds a badge by id and ignores unknown ids', () => {
    expect(badgeById('time-5h')?.name).toBe('Pięć godzin z muzyką');
    expect(badgeById('nope')).toBeUndefined();
  });
});

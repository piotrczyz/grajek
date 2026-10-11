import { describe, expect, it } from 'vitest';
import { weekDays } from '../practice/week.ts';
import { OTHER_INSTRUMENT_ICON } from '../profile/instruments.ts';
import { buildCardModel, type CardInput } from './cardModel.ts';
import { musicDaysHeadline } from './copy.ts';

// 2026-10-14 is a Wednesday; its week runs 2026-10-12 (Mon) to 2026-10-18 (Sun).
const DAYS = weekDays(new Date(2026, 9, 14, 10, 0));

const model = (musicDays: string[], instrumentName = 'Gitara') =>
  buildCardModel({ days: DAYS, musicDays: new Set(musicDays), instrumentName });

describe('musicDaysHeadline', () => {
  it.each([
    [1, '1 dzień z muzyką w tym tygodniu'],
    [2, '2 dni z muzyką w tym tygodniu'],
    [4, '4 dni z muzyką w tym tygodniu'],
    [5, '5 dni z muzyką w tym tygodniu'],
    [7, '7 dni z muzyką w tym tygodniu'],
  ])('uses the right Polish form for %i', (count, expected) => {
    expect(musicDaysHeadline(count)).toBe(expected);
  });
});

describe('buildCardModel', () => {
  it.each([1, 2, 4, 5, 7])('writes the plural headline for %i music days', (count) => {
    const card = model(DAYS.slice(0, count));
    expect(card.musicDayCount).toBe(count);
    expect(card.headline).toBe(musicDaysHeadline(count));
  });

  it('builds a 7-day Monday-first week marking exactly the music days', () => {
    const card = model([DAYS[0], DAYS[2], DAYS[6]]);
    expect(card.week.map((day) => day.short)).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
    expect(card.week.map((day) => day.music)).toEqual([true, false, true, false, false, false, true]);
  });

  it('does not count music days outside the week', () => {
    const card = model(['2026-10-11', DAYS[3], '2026-10-19']);
    expect(card.musicDayCount).toBe(1);
    expect(card.headline).toBe('1 dzień z muzyką w tym tygodniu');
    expect(card.week.filter((day) => day.music)).toHaveLength(1);
  });

  it('uses the preset icon for a preset instrument', () => {
    const card = model([DAYS[0]], 'Gitara');
    expect(card.instrumentIcon).toBe('🎸');
    expect(card.instrumentName).toBe('Gitara');
  });

  it('uses the "Inny" icon for a free-text instrument', () => {
    const card = model([DAYS[0]], 'Harfa');
    expect(card.instrumentIcon).toBe(OTHER_INSTRUMENT_ICON);
    expect(card.instrumentName).toBe('Harfa');
  });

  it('carries the title and the cheer', () => {
    const card = model([DAYS[0]]);
    expect(card.title).toBe('Grajek');
    expect(card.cheer).toBe('Ćwiczę dla siebie!');
  });

  it('never contains the profile name', () => {
    const profile = { name: 'Ola', instrument: { id: 'i1', name: 'Pianino' } };
    // The builder takes no name; extra fields passed by mistake are ignored.
    const input = {
      days: DAYS,
      musicDays: new Set([DAYS[1]]),
      instrumentName: profile.instrument.name,
      name: profile.name,
    } as CardInput;
    const card = buildCardModel(input);
    expect(Object.keys(card)).not.toContain('name');
    expect(JSON.stringify(card)).not.toContain('Ola');
  });
});

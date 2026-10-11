import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { weekDays } from './week.ts';
import { WeekView } from './WeekView.tsx';

const days = weekDays(new Date(2026, 9, 7, 12, 0)); // 2026-10-05 .. 2026-10-11

describe('WeekView', () => {
  it('renders the 7 days of the week as a list named "Ten tydzień", Monday first', () => {
    render(<WeekView days={days} musicDays={new Set()} today="2026-10-07" />);
    const list = screen.getByRole('list', { name: 'Ten tydzień' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
    expect(items[0]).toHaveAccessibleName('Poniedziałek');
    expect(items[2]).toHaveAccessibleName('Środa (dziś)');
    expect(items[2]).toHaveClass('ring-4');
  });

  it('highlights days with music and keeps empty days neutral', () => {
    render(
      <WeekView days={days} musicDays={new Set(['2026-10-05', '2026-10-07'])} today="2026-10-07" />,
    );
    const items = screen.getAllByRole('listitem');

    expect(items[0]).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');
    expect(items[0]).toHaveClass('bg-amber-300');
    expect(items[2]).toHaveAccessibleName('Środa: Dzień z muzyką (dziś)');
    expect(items[2]).toHaveClass('bg-amber-300');

    for (const index of [1, 3, 4, 5, 6]) {
      const item = items[index];
      expect(item).not.toHaveClass('bg-amber-300');
      expect(item.getAttribute('aria-label')).not.toContain('Dzień z muzyką');
      expect(item.className).not.toMatch(/red/);
      expect(item.textContent).not.toContain('♪');
    }
  });

  it('shows no counter, goal or totals', () => {
    render(<WeekView days={days} musicDays={new Set(['2026-10-05'])} today="2026-10-07" />);
    expect(screen.getByRole('list').textContent).not.toMatch(/\d/);
  });
});

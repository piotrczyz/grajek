import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  describe('tappable past days', () => {
    // Today is Thursday 2026-10-08: Mon..Wed are 3..1 days back, Fri..Sun are future.
    const thursday = '2026-10-08';

    it('makes only the empty days 1 to 3 back buttons', () => {
      render(
        <WeekView days={days} musicDays={new Set(['2026-10-06'])} today={thursday} onLogDay={() => {}} />,
      );
      const buttons = within(screen.getByRole('list')).getAllByRole('button');
      expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
        'Poniedziałek: dopisz granie',
        'Środa: dopisz granie',
      ]);
      for (const button of buttons) {
        expect(button.className).not.toMatch(/red/);
        expect(button.closest('li')).not.toHaveClass('bg-amber-300');
      }
    });

    it('never makes today, music days, older or future days tappable', () => {
      // Sunday 2026-10-11: Thu..Sat are 3..1 back, Mon..Wed are 4+ back.
      render(
        <WeekView days={days} musicDays={new Set(['2026-10-09'])} today="2026-10-11" onLogDay={() => {}} />,
      );
      expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        'Czwartek: dopisz granie',
        'Sobota: dopisz granie',
      ]);
    });

    it('calls onLogDay with the tapped day key', () => {
      const onLogDay = vi.fn();
      render(<WeekView days={days} musicDays={new Set()} today={thursday} onLogDay={onLogDay} />);
      fireEvent.click(screen.getByRole('button', { name: 'Wtorek: dopisz granie' }));
      expect(onLogDay).toHaveBeenCalledWith('2026-10-06');
    });

    it('keeps every day display-only without the handler', () => {
      render(<WeekView days={days} musicDays={new Set()} today={thursday} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.getAllByRole('listitem')).toHaveLength(7);
    });
  });
});

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LIFETIME_EMPTY, RETRY_MESSAGE } from './copy.ts';
import { MonthCard } from './MonthCard.tsx';
import type { LifetimeTotal, MonthStore } from './monthStore.ts';

// 2026-10-14 is a Wednesday; October 2026 has 31 days and starts on Thursday.
const NOW = new Date(2026, 9, 14, 17, 0);
const now = () => NOW;

function fakeStore(
  days: string[] = [],
  lifetime: LifetimeTotal = { musicDays: days.length, minutes: days.length * 15 },
) {
  return {
    musicDaysInMonth: vi.fn<MonthStore['musicDaysInMonth']>(async () => new Set(days)),
    lifetime: vi.fn<MonthStore['lifetime']>(async () => lifetime),
  };
}

const toggle = () => screen.getByRole('button', { name: 'Mój miesiąc' });

async function openCard(store: MonthStore) {
  render(<MonthCard store={store} now={now} />);
  fireEvent.click(toggle());
  return screen.findByRole('list', { name: 'Ten miesiąc' });
}

describe('MonthCard', () => {
  it('is closed by default and reads nothing', () => {
    const store = fakeStore(['2026-10-01']);
    render(<MonthCard store={store} now={now} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Ten miesiąc' })).not.toBeInTheDocument();
    expect(store.musicDaysInMonth).not.toHaveBeenCalled();
    expect(store.lifetime).not.toHaveBeenCalled();
  });

  it('opens with the month heading, the counter and every day of the month', async () => {
    const store = fakeStore(['2026-10-01', '2026-10-14'], { musicDays: 5, minutes: 150 });
    const list = await openCard(store);

    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Październik 2026' })).toBeInTheDocument();
    expect(screen.getByText('Dni z muzyką w tym miesiącu: 2')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(31);
    expect(within(list).getByRole('listitem', { name: '1 października: Dzień z muzyką' })).toBeInTheDocument();
    expect(within(list).getByRole('listitem', { name: '14 października: Dzień z muzyką (dziś)' })).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem', { name: /Dzień z muzyką/ })).toHaveLength(2);
    expect(screen.getByText('Razem: 5 dni z muzyką · 2 godz. 30 min')).toBeInTheDocument();
    expect(store.musicDaysInMonth).toHaveBeenCalledWith(NOW);
  });

  it('keeps empty days neutral: no music label and no red styling', async () => {
    const list = await openCard(fakeStore(['2026-10-14']));
    const empty = within(list).getByRole('listitem', { name: '2 października' });
    expect(empty.className).toContain('bg-white/10');
    expect(empty.className).not.toMatch(/red/);
    expect(screen.queryByText(/opuści|przerw|nie grałeś/i)).not.toBeInTheDocument();
  });

  it('uses the singular for one lifetime music day and minutes only below an hour', async () => {
    await openCard(fakeStore(['2026-10-14'], { musicDays: 1, minutes: 20 }));
    expect(screen.getByText('Razem: 1 dzień z muzyką · 20 min')).toBeInTheDocument();
  });

  it('shows an encouraging line instead of zeros when nothing was logged yet', async () => {
    await openCard(fakeStore([], { musicDays: 0, minutes: 0 }));
    expect(screen.getByText(LIFETIME_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/Razem:/)).not.toBeInTheDocument();
  });

  it('shows the retry message when reading fails and reloads on retry', async () => {
    const store = fakeStore(['2026-10-14']);
    store.lifetime.mockRejectedValueOnce(new Error('boom'));
    render(<MonthCard store={store} now={now} />);
    fireEvent.click(toggle());

    expect(await screen.findByText(RETRY_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj jeszcze raz' }));

    expect(await screen.findByRole('list', { name: 'Ten miesiąc' })).toBeInTheDocument();
    expect(screen.queryByText(RETRY_MESSAGE)).not.toBeInTheDocument();
    expect(store.lifetime).toHaveBeenCalledTimes(2);
  });

  it('reads fresh data at every opening and hides the section when closed', async () => {
    const store = fakeStore(['2026-10-14']);
    await openCard(store);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Ten miesiąc' })).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(await screen.findByRole('list', { name: 'Ten miesiąc' })).toBeInTheDocument();
    expect(store.lifetime).toHaveBeenCalledTimes(2);
  });

  it('reloads when the app becomes visible again while open', async () => {
    const store = fakeStore(['2026-10-14']);
    await openCard(store);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.lifetime).toHaveBeenCalledTimes(2);
  });
});

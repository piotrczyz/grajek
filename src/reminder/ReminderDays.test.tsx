import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PracticeTime } from '../practice-time/index.ts';
import { REMINDER_TEXT } from './copy.ts';
import type { ReminderDays as Days } from './reminder.ts';
import { ReminderDays } from './ReminderDays.tsx';

const PORA: PracticeTime = {
  default: { time: '17:00', place: 'W domu' },
  overrides: {},
  updatedAt: '2026-10-01T10:00:00.000Z',
};

function setup(initial: Days = { mode: 'all' }, practiceTime: PracticeTime | null = PORA) {
  const saved: Days[] = [];
  const props = {
    loadDays: vi.fn(async () => initial),
    saveDays: vi.fn(async (days: Days) => {
      saved.push(days);
    }),
    loadPracticeTime: vi.fn(async () => practiceTime),
    sync: vi.fn(async () => 'sent'),
  };
  render(<ReminderDays {...props} />);
  return { props, saved };
}

describe('ReminderDays', () => {
  it('shows "Codziennie" selected by default and syncs on mount', async () => {
    const { props } = setup();
    expect(await screen.findByRole('button', { name: REMINDER_TEXT.everyDay })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: REMINDER_TEXT.chosenDays })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('group', { name: REMINDER_TEXT.daysGroup })).not.toBeInTheDocument();
    expect(props.sync).toHaveBeenCalledTimes(1);
  });

  it('switching to chosen days turns all seven days on, saves and syncs', async () => {
    const { props, saved } = setup();
    fireEvent.click(await screen.findByRole('button', { name: REMINDER_TEXT.chosenDays }));
    const chips = screen.getAllByRole('button', { pressed: true }).filter((b) => b.textContent?.length === 2);
    expect(chips).toHaveLength(7);
    expect(saved).toEqual([{ mode: 'chosen', weekdays: [1, 2, 3, 4, 5, 6, 7] }]);
    await waitFor(() => expect(props.sync).toHaveBeenCalledTimes(2));
  });

  it('a day chip toggles that day off and on, with the full name as its label', async () => {
    const { saved } = setup({ mode: 'chosen', weekdays: [1, 3, 5] });
    const sunday = await screen.findByRole('button', { name: 'Niedziela' });
    expect(sunday).toHaveTextContent('Nd');
    expect(sunday).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sunday);
    expect(sunday).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Środa' }));
    expect(saved).toEqual([
      { mode: 'chosen', weekdays: [1, 3, 5, 7] },
      { mode: 'chosen', weekdays: [1, 5, 7] },
    ]);
  });

  it('switching back to every day saves it', async () => {
    const { saved } = setup({ mode: 'chosen', weekdays: [2] });
    fireEvent.click(await screen.findByRole('button', { name: REMINDER_TEXT.everyDay }));
    expect(saved).toEqual([{ mode: 'all' }]);
    expect(screen.queryByRole('group', { name: REMINDER_TEXT.daysGroup })).not.toBeInTheDocument();
  });

  it('asks for at least one day when none is chosen', async () => {
    setup({ mode: 'chosen', weekdays: [] });
    expect(await screen.findByText(REMINDER_TEXT.noDays)).toBeInTheDocument();
  });

  it('points to setting the practice time when none is saved', async () => {
    setup({ mode: 'all' }, null);
    expect(await screen.findByText(REMINDER_TEXT.noPracticeTime)).toBeInTheDocument();
  });

  it('does not show the hint when a practice time is saved', async () => {
    const { props } = setup();
    await screen.findByRole('button', { name: REMINDER_TEXT.everyDay });
    await waitFor(() => expect(props.loadPracticeTime).toHaveBeenCalled());
    expect(screen.queryByText(REMINDER_TEXT.noPracticeTime)).not.toBeInTheDocument();
  });
});

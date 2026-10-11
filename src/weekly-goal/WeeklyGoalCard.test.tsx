import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeStore } from '../practice/index.ts';
import { openDb } from '../storage/index.ts';
import { RETRY_MESSAGE } from './copy.ts';
import { WeeklyGoalCard } from './WeeklyGoalCard.tsx';
import { createIndexedDbWeeklyGoalStore, type WeeklyGoalStore } from './weeklyGoalStore.ts';

let counter = 0;
const uniqueName = () => `grajek-goal-card-test-${Date.now()}-${(counter += 1)}`;
// 2026-10-14 is a Wednesday; its week starts on Monday 2026-10-12.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);
const storeOn = (name: string) =>
  createIndexedDbWeeklyGoalStore((onClose) => openDb({ name, onClose }), () => WEDNESDAY);

const practiceStore: PracticeStore = {
  add: () => Promise.reject(new Error('not used')),
  listWeek: () => Promise.resolve([]),
  lastDuration: () => Promise.resolve(null),
};

const renderCard = (store: WeeklyGoalStore, musicDayCount = 0) =>
  render(
    <WeeklyGoalCard musicDayCount={musicDayCount} now={WEDNESDAY} practiceStore={practiceStore} store={store} />,
  );

const option = (days: number) => screen.getByRole('radio', { name: new RegExp(`^${days} (dzień|dni)`) });
const saveButton = () => screen.getByRole('button', { name: 'Ustaw cel' });

beforeEach(() => {
  // Fake only the clock: IndexedDB in tests still needs real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WeeklyGoalCard', () => {
  it('shows the chooser with options 1 to 6, 3 checked, 3 and 4 suggested, no 7', async () => {
    renderCard(storeOn(uniqueName()));
    expect(await screen.findByRole('heading', { name: 'Ustal cel tygodnia' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Ile dni w tygodniu chcesz grać?' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(option(3)).toHaveAttribute('aria-checked', 'true');
    expect(option(1)).toHaveAttribute('aria-checked', 'false');
    expect(option(3)).toHaveAccessibleName('3 dni, dobry start');
    expect(option(4)).toHaveAccessibleName('4 dni, dobry start');
    expect(option(5)).toHaveAccessibleName('5 dni');
    expect(screen.queryByRole('radio', { name: /^7/ })).not.toBeInTheDocument();
    expect(screen.getByText('Jeden dzień zawsze zostaje na zapas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anuluj' })).not.toBeInTheDocument();
  });

  it('saves 4 in a fresh week and shows "0 z 4 dni", persisted', async () => {
    const name = uniqueName();
    renderCard(storeOn(name));
    fireEvent.click(await screen.findByRole('radio', { name: /^4 dni/ }));
    expect(option(4)).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(saveButton());

    expect(await screen.findByRole('status')).toHaveTextContent('0 z 4 dni');
    expect(screen.getByText('Cel tygodnia')).toBeInTheDocument();
    expect(await storeOn(name).load()).toMatchObject({ daysPerWeek: 4, since: '2026-10-12' });
  });

  it('shows "3 z 4 dni" with 3 music days', async () => {
    const store = storeOn(uniqueName());
    await store.setGoal(4);
    renderCard(store, 3);
    expect(await screen.findByRole('status')).toHaveTextContent('3 z 4 dni');
    expect(screen.queryByText('Cel osiągnięty!')).not.toBeInTheDocument();
  });

  it('marks the goal reached at 4 of 4 and never shows "5 z 4"', async () => {
    const store = storeOn(uniqueName());
    await store.setGoal(4);
    const { rerender } = renderCard(store, 4);
    expect(await screen.findByText('Cel osiągnięty!')).toBeInTheDocument();
    expect(screen.getByText('W tym tygodniu: 4 dni z muzyką')).toBeInTheDocument();

    rerender(<WeeklyGoalCard musicDayCount={5} now={WEDNESDAY} practiceStore={practiceStore} store={store} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cel osiągnięty!W tym tygodniu: 5 dni z muzyką');
    expect(screen.queryByText(/5 z 4/)).not.toBeInTheDocument();
  });

  it('updates from progress to reached when the count grows', async () => {
    const store = storeOn(uniqueName());
    await store.setGoal(2);
    const { rerender } = renderCard(store, 1);
    expect(await screen.findByRole('status')).toHaveTextContent('1 z 2 dni');
    rerender(<WeeklyGoalCard musicDayCount={2} now={WEDNESDAY} practiceStore={practiceStore} store={store} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cel osiągnięty!');
  });

  it('changes the goal: preselects the current one, cancel keeps it, save applies at once', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    await store.setGoal(4);
    renderCard(store, 3);
    fireEvent.click(await screen.findByRole('button', { name: 'Zmień' }));
    expect(option(4)).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 z 4 dni');

    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }));
    fireEvent.click(option(2));
    fireEvent.click(saveButton());
    expect(await screen.findByText('Cel osiągnięty!')).toBeInTheDocument();
    expect(await storeOn(name).load()).toMatchObject({ daysPerWeek: 2 });
  });

  it('renders nothing when the goal cannot be loaded', async () => {
    const failing: WeeklyGoalStore = {
      load: vi.fn(() => Promise.reject(new Error('boom'))),
      setGoal: () => Promise.reject(new Error('not used')),
      declineRaise: () => Promise.reject(new Error('not used')),
    };
    const { container } = renderCard(failing);
    await vi.waitFor(() => expect(failing.load).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the chooser and shows the retry text when saving fails', async () => {
    const failing: WeeklyGoalStore = {
      load: () => Promise.resolve(null),
      setGoal: () => Promise.reject(new Error('quota')),
      declineRaise: () => Promise.reject(new Error('not used')),
    };
    renderCard(failing);
    fireEvent.click(await screen.findByRole('button', { name: 'Ustaw cel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(RETRY_MESSAGE);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(saveButton()).toBeEnabled();
  });
});

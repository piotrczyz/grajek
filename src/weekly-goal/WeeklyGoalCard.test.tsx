import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { weekDays, type Practice, type PracticeStore } from '../practice/index.ts';
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

describe('WeeklyGoalCard raise offer', () => {
  // Goal set on Wednesday 2026-09-16 (week of 2026-09-14); the three completed
  // weeks before the current one start 2026-09-21, 2026-09-28 and 2026-10-05.
  const SEPTEMBER = new Date(2026, 8, 16, 10, 0);

  /** A practice store whose past weeks hold `counts[weekStart]` distinct music days. */
  const pastWeeks = (counts: Record<string, number>): PracticeStore => ({
    add: () => Promise.reject(new Error('not used')),
    listWeek: (when = new Date()) => {
      const days = weekDays(when);
      const count = counts[days[0]] ?? 0;
      return Promise.resolve(
        days.slice(0, count).map(
          (day, i): Practice => ({
            id: `${day}-${i}`,
            instrumentId: 'i1',
            durationMinutes: 15,
            day,
            createdAt: `${day}T10:00:00.000Z`,
          }),
        ),
      );
    },
    lastDuration: () => Promise.resolve(null),
  });

  const reachedThree = (days: number) =>
    pastWeeks({ '2026-09-21': days, '2026-09-28': days, '2026-10-05': days });

  async function goalSetInSeptember(name: string, days: number) {
    await createIndexedDbWeeklyGoalStore((onClose) => openDb({ name, onClose }), () => SEPTEMBER).setGoal(days);
    return storeOn(name);
  }

  const renderWith = (store: WeeklyGoalStore, practices: PracticeStore) =>
    render(<WeeklyGoalCard musicDayCount={1} now={WEDNESDAY} practiceStore={practices} store={store} />);

  it('offers one more day after 3 reached weeks, and accepting raises the goal', async () => {
    const name = uniqueName();
    renderWith(await goalSetInSeptember(name, 4), reachedThree(4));

    expect(await screen.findByText('Świetnie Ci idzie! Chcesz spróbować 5 dni?')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 z 4 dni');
    expect(screen.queryByText(/\d+ tygod/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tak, spróbuję' }));
    expect(await screen.findByText('1 z 5 dni')).toBeInTheDocument();
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
    expect(await storeOn(name).load()).toMatchObject({ daysPerWeek: 5, since: '2026-10-12' });
  });

  it('declining hides the offer, also after a re-mount in the same week', async () => {
    const name = uniqueName();
    const { unmount } = renderWith(await goalSetInSeptember(name, 3), reachedThree(3));

    fireEvent.click(await screen.findByRole('button', { name: 'Zostaję przy 3' }));
    await vi.waitFor(async () =>
      expect(await storeOn(name).load()).toMatchObject({ daysPerWeek: 3, raiseDeclinedWeek: '2026-10-12' }),
    );
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 z 3 dni');
    unmount();

    renderWith(storeOn(name), reachedThree(3));
    expect(await screen.findByRole('status')).toHaveTextContent('1 z 3 dni');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
  });

  it('does not offer after only two reached weeks', async () => {
    renderWith(
      await goalSetInSeptember(uniqueName(), 4),
      pastWeeks({ '2026-09-21': 2, '2026-09-28': 4, '2026-10-05': 4 }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('1 z 4 dni');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
  });

  it('never offers with a goal of 6', async () => {
    const practices = reachedThree(7);
    const listWeek = vi.spyOn(practices, 'listWeek');
    renderWith(await goalSetInSeptember(uniqueName(), 6), practices);
    expect(await screen.findByRole('status')).toHaveTextContent('1 z 6 dni');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
    expect(listWeek).not.toHaveBeenCalled();
  });

  it('hides the offer when the past weeks cannot be read', async () => {
    const practices: PracticeStore = { ...reachedThree(4), listWeek: () => Promise.reject(new Error('boom')) };
    renderWith(await goalSetInSeptember(uniqueName(), 4), practices);
    expect(await screen.findByRole('status')).toHaveTextContent('1 z 4 dni');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Chcesz spróbować/)).not.toBeInTheDocument();
  });
});

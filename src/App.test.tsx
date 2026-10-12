import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, GREETING } from './App.tsx';
import { createIndexedDbPracticeStore } from './practice/index.ts';
import { createIndexedDbProfileStore, type ProfileStore } from './profile/index.ts';
import { hasUnsavedWork } from './pwa/index.ts';
import { openDb } from './storage/index.ts';

let counter = 0;
const uniqueName = () => `grajek-app-test-${Date.now()}-${(counter += 1)}`;
const storeOn = (name: string) => createIndexedDbProfileStore(() => openDb({ name }));

const nameInput = () => screen.getByLabelText('Jak masz na imię? Może być pseudonim.');
const doneButton = () => screen.getByRole('button', { name: 'Gotowe' });

async function renderFirstLaunch(store: ProfileStore = storeOn(uniqueName())) {
  render(<App store={store} />);
  await screen.findByLabelText('Jak masz na imię? Może być pseudonim.');
  return store;
}

describe('first launch', () => {
  it('shows the Grajek heading, the greeting and the create form', async () => {
    await renderFirstLaunch();
    expect(screen.getByRole('heading', { level: 1, name: 'Grajek' })).toBeInTheDocument();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(GREETING).toBe('Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie.');
    expect(screen.getByRole('radiogroup', { name: 'Na czym grasz?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gitara' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Inny' })).toBeInTheDocument();
  });

  it('keeps "Gotowe" disabled until a name and an instrument are chosen', async () => {
    await renderFirstLaunch();
    expect(doneButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Flet' }));
    expect(doneButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: 'Ola' } });
    expect(doneButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Inny' }));
    expect(doneButton()).toBeDisabled();
  });

  it('creates the profile with a preset instrument and shows the profile screen', async () => {
    await renderFirstLaunch();
    fireEvent.change(nameInput(), { target: { value: ' Ola ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Gitara' }));
    expect(screen.getByRole('radio', { name: 'Gitara' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(doneButton());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gitara')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gotowe' })).not.toBeInTheDocument();
  });

  it('holds a reload onto a new version while the form is being filled, until the profile is saved', async () => {
    await renderFirstLaunch();
    expect(hasUnsavedWork()).toBe(false);

    fireEvent.change(nameInput(), { target: { value: 'Ola' } });
    expect(hasUnsavedWork()).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Gitara' }));
    fireEvent.click(doneButton());

    expect(await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeInTheDocument();
    await waitFor(() => expect(hasUnsavedWork()).toBe(false));
  });

  it('saves the typed label when "Inny" is chosen', async () => {
    const store = await renderFirstLaunch();
    fireEvent.change(nameInput(), { target: { value: 'Kuba' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Inny' }));
    fireEvent.change(screen.getByLabelText('Jaki to instrument?'), {
      target: { value: ' Akordeon ' },
    });
    fireEvent.click(doneButton());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cześć, Kuba!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Akordeon')).toBeInTheDocument();
    await expect(store.load()).resolves.toMatchObject({
      name: 'Kuba',
      instrument: { name: 'Akordeon' },
    });
  });

  it('shows the retry message when saving fails and keeps the form', async () => {
    const store: ProfileStore = {
      load: () => Promise.resolve(null),
      create: vi.fn(() => Promise.reject(new Error('quota'))),
      addInstrument: vi.fn(),
    };
    await renderFirstLaunch(store);
    fireEvent.change(nameInput(), { target: { value: 'Ola' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Pianino' }));
    fireEvent.click(doneButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    expect(doneButton()).toBeEnabled();
    expect(store.create).toHaveBeenCalledTimes(1);
  });
});

describe('returning student', () => {
  it('shows the saved profile, not the form, when the app is opened again', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Zosia', instrumentName: 'Skrzypce' });

    render(<App store={storeOn(name)} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cześć, Zosia!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Skrzypce')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jak masz na imię? Może być pseudonim.')).not.toBeInTheDocument();
  });

  it('renders no form while the profile is loading', () => {
    const store: ProfileStore = {
      load: () => new Promise(() => {}),
      create: vi.fn(),
      addInstrument: vi.fn(),
    };
    render(<App store={store} />);
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
  });

  it('shows the retry message when loading fails and loads again on retry', async () => {
    const load = vi
      .fn<ProfileStore['load']>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue(null);
    render(<App store={{ load, create: vi.fn(), addInstrument: vi.fn() }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj jeszcze raz' }));

    expect(
      await screen.findByLabelText('Jak masz na imię? Może być pseudonim.'),
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('logging a practice session', () => {
  const practiceOn = (name: string) => createIndexedDbPracticeStore((onClose) => openDb({ name, onClose }));

  async function renderHome() {
    const name = uniqueName();
    const profile = await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    const practiceStore = practiceOn(name);
    render(<App store={storeOn(name)} practiceStore={practiceStore} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });
    return { profile, practiceStore, name };
  }

  it('saves a session in 3 taps from the home screen', async () => {
    const { profile, practiceStore } = await renderHome();

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: '30 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Super! Zapisane.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument();
    const week = await practiceStore.listWeek();
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ durationMinutes: 30, instrumentId: profile.instrument.id });
  });

  it('saves the preselected duration in 2 taps (15 min on first use)', async () => {
    const { practiceStore } = await renderHome();

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: '15 min' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Super! Zapisane.')).toBeInTheDocument();
    await expect(practiceStore.listWeek()).resolves.toMatchObject([{ durationMinutes: 15 }]);
  });

  it('preselects the last used duration when the app is opened again', async () => {
    const name = uniqueName();
    const profile = await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    await practiceOn(name).add({ instrumentId: profile.instrument.id, durationMinutes: 45 });

    const practiceStore = practiceOn(name);
    const lastPractice = vi.spyOn(practiceStore, 'lastPractice');
    render(<App store={storeOn(name)} practiceStore={practiceStore} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });
    await waitFor(() => expect(lastPractice).toHaveBeenCalled());
    await act(async () => {
      await lastPractice.mock.results[0].value;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: '45 min' })).toHaveAttribute('aria-checked', 'true');
  });

  it('remembers the duration just saved for the next session', async () => {
    await renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: '10 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await screen.findByText('Super! Zapisane.');

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: '10 min' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Super! Zapisane.')).not.toBeInTheDocument();
  });

  it('closes the panel without saving on cancel', async () => {
    const { practiceStore } = await renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.getByRole('button', { name: 'Zagrałem!' })).toBeInTheDocument();
    await expect(practiceStore.listWeek()).resolves.toEqual([]);
  });
});

describe('current-week view on the home screen', () => {
  const practiceOn = (name: string) => createIndexedDbPracticeStore((onClose) => openDb({ name, onClose }));
  const musicDays = () =>
    within(screen.getByRole('list', { name: 'Ten tydzień' }))
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-label')?.includes('Dzień z muzyką'));

  it('highlights today after a save, and a second save the same day keeps one music day', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    render(<App store={storeOn(name)} practiceStore={practiceOn(name)} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });

    const today = () => screen.getByRole('listitem', { name: /\(dziś\)$/ });
    expect(today()).not.toHaveAccessibleName(/Dzień z muzyką/);
    expect(musicDays()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(today()).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/));
    expect(musicDays()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: '5 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await screen.findByText('Super! Zapisane.');
    await waitFor(() => expect(musicDays()).toHaveLength(1));
    expect(today()).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/);
  });

  it('highlights the new today when a save happens after midnight in a session left open', async () => {
    // Only Date is faked: IndexedDB and React keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 9, 11, 23, 59)); // Sunday
      const name = uniqueName();
      await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
      render(<App store={storeOn(name)} practiceStore={practiceOn(name)} />);
      await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });

      vi.setSystemTime(new Date(2026, 9, 12, 0, 1)); // Monday, no visibilitychange
      fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
      fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
      await screen.findByText('Super! Zapisane.');

      const today = () => screen.getByRole('listitem', { name: /\(dziś\)$/ });
      await waitFor(() => expect(today()).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/));
      expect(musicDays()).toHaveLength(1);
      expect(musicDays()[0]).toBe(today());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('several instruments on the home screen', () => {
  const practiceOn = (name: string) => createIndexedDbPracticeStore((onClose) => openDb({ name, onClose }));

  async function seedTwoInstruments() {
    const name = uniqueName();
    const profile = await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    const piano = await storeOn(name).addInstrument('Pianino');
    return { name, guitar: profile.instrument, piano };
  }

  async function renderAndWaitForLastPractice(name: string) {
    const practiceStore = practiceOn(name);
    const lastPractice = vi.spyOn(practiceStore, 'lastPractice');
    render(<App store={storeOn(name)} practiceStore={practiceStore} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });
    await waitFor(() => expect(lastPractice).toHaveBeenCalled());
    await act(async () => {
      await lastPractice.mock.results[0].value;
    });
    return practiceStore;
  }

  it('counts sessions on two instruments on the same day as one Dzień z muzyką', async () => {
    const { name, guitar, piano } = await seedTwoInstruments();
    await practiceOn(name).add({ instrumentId: guitar.id, durationMinutes: 15 });
    await practiceOn(name).add({ instrumentId: piano.id, durationMinutes: 20 });

    render(<App store={storeOn(name)} practiceStore={practiceOn(name)} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });

    const week = () =>
      within(screen.getByRole('list', { name: 'Ten tydzień' }))
        .getAllByRole('listitem')
        .filter((item) => item.getAttribute('aria-label')?.includes('Dzień z muzyką'));
    await waitFor(() => expect(week()).toHaveLength(1));
    expect(week()[0]).toBe(screen.getByRole('listitem', { name: /: Dzień z muzyką \(dziś\)$/ }));
  });

  it('shows the last used instrument in the header after reload and preselects it', async () => {
    const { name, piano } = await seedTwoInstruments();
    await practiceOn(name).add({ instrumentId: piano.id, durationMinutes: 30 });

    await renderAndWaitForLastPractice(name);
    expect(screen.getByText('Pianino')).toBeInTheDocument();
    expect(screen.queryByText('Gitara')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: 'Pianino' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '30 min' })).toHaveAttribute('aria-checked', 'true');
  });

  it('preselects the oldest instrument before the first session and switches to the one just used', async () => {
    const { name, guitar } = await seedTwoInstruments();
    const practiceStore = await renderAndWaitForLastPractice(name);

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: 'Gitara' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Pianino' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await screen.findByText('Super! Zapisane.');

    expect(screen.getByText('Pianino')).toBeInTheDocument();
    const week = await practiceStore.listWeek();
    expect(week.map((practice) => practice.instrumentId)).not.toContain(guitar.id);
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: 'Pianino' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows no instrument choice when the profile has one instrument', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    await renderAndWaitForLastPractice(name);
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.queryByRole('radiogroup', { name: 'Na czym grałeś?' })).not.toBeInTheDocument();
  });
});

describe('notifications panel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('hides the notifications panel where push cannot work (jsdom, no VAPID key)', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    await renderFirstLaunch();
    expect(screen.getByRole('heading', { level: 1, name: 'Grajek' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Powiadomienia' })).not.toBeInTheDocument();
  });

  it('mounts the notifications panel on the first-launch screen (install hint without PushManager)', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-key');
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      maxTouchPoints: 5,
      serviceWorker: { ready: new Promise(() => {}) },
    });
    await renderFirstLaunch();
    expect(screen.getByRole('heading', { level: 2, name: 'Powiadomienia' })).toBeInTheDocument();
    expect(
      screen.getByText('Dodaj Grajka do ekranu początkowego, żeby dostawać przypomnienia.'),
    ).toBeInTheDocument();
  });
});

describe('weekly goal on the home screen', () => {
  const practiceOn = (name: string) => createIndexedDbPracticeStore((onClose) => openDb({ name, onClose }));
  const goalStatus = () =>
    within(screen.getByRole('region', { name: 'Cel tygodnia' })).getByRole('status');

  it('shows the goal reached right after a save, and a second save the same day changes nothing', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    render(<App store={storeOn(name)} practiceStore={practiceOn(name)} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });

    fireEvent.click(await screen.findByRole('radio', { name: /^1 dzień/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ustaw cel' }));
    await waitFor(() => expect(goalStatus()).toHaveTextContent('0 z 1 dnia'));

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(goalStatus()).toHaveTextContent('Cel osiągnięty!'));
    expect(goalStatus()).toHaveTextContent('W tym tygodniu: 1 dzień z muzyką');

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: '5 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await screen.findByText('Super! Zapisane.');
    await waitFor(() => expect(goalStatus()).toHaveTextContent('W tym tygodniu: 1 dzień z muzyką'));
    expect(goalStatus()).toHaveTextContent('Cel osiągnięty!');
  });
});

describe('logging a practice session for a past day', () => {
  const practiceOn = (name: string) => createIndexedDbPracticeStore((onClose) => openDb({ name, onClose }));
  const week = () => screen.getByRole('list', { name: 'Ten tydzień' });
  const musicDays = () =>
    within(week())
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-label')?.includes('Dzień z muzyką'));
  const goalStatus = () =>
    within(screen.getByRole('region', { name: 'Cel tygodnia' })).getByRole('status');

  async function renderHomeAt(date: Date) {
    // Only Date is faked: IndexedDB and React keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(date);
    const name = uniqueName();
    await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    const practiceStore = practiceOn(name);
    render(<App store={storeOn(name)} practiceStore={practiceStore} />);
    await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });
    return practiceStore;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-01: logs yesterday from the chips and highlights it', async () => {
    const practiceStore = await renderHomeAt(new Date(2026, 9, 14, 17, 0)); // Wednesday
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Wczoraj' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Super! Dopisane do wtorku.')).toBeInTheDocument();
    await waitFor(() => expect(musicDays()).toHaveLength(1));
    expect(musicDays()[0]).toHaveAccessibleName('Wtorek: Dzień z muzyką');
    await expect(practiceStore.listWeek()).resolves.toMatchObject([{ day: '2026-10-13' }]);
  });

  it('AC-02: saving right away still logs today', async () => {
    await renderHomeAt(new Date(2026, 9, 14, 17, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    expect(screen.getByRole('radio', { name: 'Dziś' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Super! Zapisane.')).toBeInTheDocument();
    await waitFor(() => expect(musicDays()).toHaveLength(1));
    expect(musicDays()[0]).toHaveAccessibleName('Środa: Dzień z muzyką (dziś)');
  });

  it('AC-03: tapping the day before yesterday opens the panel with that day chosen', async () => {
    await renderHomeAt(new Date(2026, 9, 14, 17, 0));
    fireEvent.click(within(week()).getByRole('button', { name: 'Poniedziałek: dopisz granie' }));

    expect(screen.getByRole('radio', { name: 'Przedwczoraj' })).toHaveAttribute('aria-checked', 'true');
    // No week-day taps while the panel is open.
    expect(within(week()).queryAllByRole('button')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(await screen.findByText('Super! Dopisane do poniedziałku.')).toBeInTheDocument();
    await waitFor(() => expect(musicDays()).toHaveLength(1));
    expect(musicDays()[0]).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');
    expect(within(week()).queryByRole('button', { name: /^Poniedziałek/ })).not.toBeInTheDocument();
  });

  it('AC-05: on Monday, logging Saturday leaves this week and its goal unchanged', async () => {
    const practiceStore = await renderHomeAt(new Date(2026, 9, 12, 9, 0)); // Monday
    // The goal store is the app's default database, shared by this file: set a goal only when none exists yet.
    await screen.findByRole('region', { name: 'Cel tygodnia' });
    const choose = screen.queryByRole('radio', { name: /^1 dzień/ });
    if (choose) {
      fireEvent.click(choose);
      fireEvent.click(screen.getByRole('button', { name: 'Ustaw cel' }));
    }
    await waitFor(() => expect(goalStatus()).toHaveTextContent(/^0 z /));
    const goalBefore = goalStatus().textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Przedwczoraj' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Super! Dopisane do soboty.')).toBeInTheDocument();
    await expect(practiceStore.listWeek(new Date(2026, 9, 10, 12, 0))).resolves.toMatchObject([
      { day: '2026-10-10' },
    ]);
    await expect(practiceStore.listWeek()).resolves.toEqual([]);
    expect(musicDays()).toHaveLength(0);
    expect(goalStatus().textContent).toBe(goalBefore);
  });
});

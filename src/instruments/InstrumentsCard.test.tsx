import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_INSTRUMENTS, type Instrument, type ProfileStore } from '../profile/index.ts';
import { hasUnsavedWork } from '../pwa/index.ts';
import { InstrumentsCard } from './InstrumentsCard.tsx';
import { instrumentStats, type StatsPracticeRecord } from './stats.ts';
import type { StatsStore } from './statsStore.ts';

const instrument = (id: string, name: string, day = 1): Instrument => ({
  id,
  name,
  createdAt: `2026-10-0${day}T10:00:00.000Z`,
});
const guitar = instrument('guitar', 'Gitara', 1);
const piano = instrument('piano', 'Pianino', 2);

function fakeStatsStore(records: StatsPracticeRecord[] = []) {
  return {
    stats: vi.fn<StatsStore['stats']>(async (instruments) => instrumentStats(instruments, records)),
  };
}

function fakeProfileStore(addInstrument: ProfileStore['addInstrument'] = async (name) => instrument('new', name.trim(), 3)) {
  return {
    load: vi.fn<ProfileStore['load']>(async () => null),
    create: vi.fn<ProfileStore['create']>(),
    addInstrument: vi.fn(addInstrument),
  };
}

/** The card inside a parent that keeps the instruments in state, as App does. */
function Harness({
  initial,
  profileStore,
  statsStore,
  onAdded,
}: {
  initial: Instrument[];
  profileStore: ProfileStore;
  statsStore: StatsStore;
  onAdded: (instrument: Instrument) => void;
}) {
  const [instruments, setInstruments] = useState(initial);
  return (
    <InstrumentsCard
      instruments={instruments}
      profileStore={profileStore}
      statsStore={statsStore}
      onAdded={(added) => {
        onAdded(added);
        setInstruments((current) => [...current, added]);
      }}
    />
  );
}

function renderCard(
  initial: Instrument[],
  { statsStore = fakeStatsStore(), profileStore = fakeProfileStore() } = {},
) {
  const onAdded = vi.fn();
  render(<Harness initial={initial} profileStore={profileStore} statsStore={statsStore} onAdded={onAdded} />);
  return { onAdded, statsStore, profileStore };
}

const toggle = () => screen.getByRole('button', { name: 'Moje instrumenty' });
const list = () => screen.findByRole('list', { name: 'Moje instrumenty' });

describe('InstrumentsCard', () => {
  it('is closed by default and reads nothing', () => {
    const { statsStore } = renderCard([guitar]);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Moje instrumenty' })).not.toBeInTheDocument();
    expect(statsStore.stats).not.toHaveBeenCalled();
  });

  it('shows each instrument with its own stats and the combined line', async () => {
    const statsStore = fakeStatsStore([
      { instrumentId: 'guitar', day: '2026-10-06', durationMinutes: 30 },
      { instrumentId: 'guitar', day: '2026-10-07', durationMinutes: 15 },
      { instrumentId: 'piano', day: '2026-10-07', durationMinutes: 60 },
    ]);
    renderCard([guitar, piano], { statsStore });
    fireEvent.click(toggle());

    const items = within(await list()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Gitara');
    expect(items[0]).toHaveTextContent('2 dni z muzyką · 45 min');
    expect(items[1]).toHaveTextContent('Pianino');
    expect(items[1]).toHaveTextContent('1 dzień z muzyką · 1 godz.');
    expect(screen.getByText('Razem: 2 dni z muzyką · 1 godz. 45 min')).toBeInTheDocument();
  });

  it('shows a neutral line for an instrument without sessions and no combined line for a single instrument', async () => {
    renderCard([guitar]);
    fireEvent.click(toggle());
    const items = within(await list()).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Jeszcze przed Tobą');
    expect(items[0].innerHTML).not.toMatch(/red|0 dni/);
    expect(screen.queryByText(/^Razem:/)).not.toBeInTheDocument();
  });

  it('adds an instrument from a preset, reports it and lists it', async () => {
    const { onAdded, profileStore, statsStore } = renderCard([guitar]);
    fireEvent.click(toggle());
    await list();

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj instrument' }));
    const confirm = screen.getByRole('button', { name: 'Dodaj' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Pianino' }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(profileStore.addInstrument).toHaveBeenCalledWith('Pianino');
    await waitFor(async () =>
      expect(within(await list()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        expect.stringContaining('Gitara'),
        expect.stringContaining('Pianino'),
      ]),
    );
    expect(screen.queryByRole('button', { name: 'Dodaj' })).not.toBeInTheDocument();
    expect(statsStore.stats).toHaveBeenLastCalledWith([guitar, expect.objectContaining({ name: 'Pianino' })]);
  });

  it('adds a typed instrument under "Inny"', async () => {
    const { profileStore } = renderCard([guitar]);
    fireEvent.click(toggle());
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj instrument' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Inny' }));
    expect(screen.getByRole('button', { name: 'Dodaj' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Jak się nazywa ten instrument?'), { target: { value: ' gitara ' } });
    expect(screen.getByRole('button', { name: 'Dodaj' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Jak się nazywa ten instrument?'), { target: { value: ' Akordeon ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    await waitFor(() => expect(profileStore.addInstrument).toHaveBeenCalledWith(' Akordeon '));
  });

  it('holds a reload onto a new version while the add form is open, until the instrument is saved', async () => {
    renderCard([guitar]);
    fireEvent.click(toggle());
    await list();
    expect(hasUnsavedWork()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj instrument' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Inny' }));
    fireEvent.change(screen.getByLabelText('Jak się nazywa ten instrument?'), { target: { value: 'Akordeon' } });
    expect(hasUnsavedWork()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Dodaj' })).not.toBeInTheDocument());
    expect(hasUnsavedWork()).toBe(false);
  });

  it('does not offer the presets already owned', async () => {
    renderCard([guitar, piano]);
    fireEvent.click(toggle());
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj instrument' }));
    const group = screen.getByRole('radiogroup', { name: 'Jaki instrument dodajesz?' });
    expect(within(group).queryByRole('radio', { name: 'Gitara' })).not.toBeInTheDocument();
    expect(within(group).queryByRole('radio', { name: 'Pianino' })).not.toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Flet' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Inny' })).toBeInTheDocument();
  });

  it('shows the retry message when adding fails and keeps the form', async () => {
    const profileStore = fakeProfileStore(() => Promise.reject(new Error('quota')));
    const { onAdded } = renderCard([guitar], { profileStore });
    fireEvent.click(toggle());
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj instrument' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Flet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    expect(screen.getByRole('button', { name: 'Dodaj' })).toBeEnabled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('hides "Dodaj instrument" at the limit', async () => {
    const full = Array.from({ length: MAX_INSTRUMENTS }, (_, i) => instrument(`i${i}`, `Instrument ${i}`, i + 1));
    renderCard(full);
    fireEvent.click(toggle());
    expect(within(await list()).getAllByRole('listitem')).toHaveLength(MAX_INSTRUMENTS);
    expect(screen.queryByRole('button', { name: 'Dodaj instrument' })).not.toBeInTheDocument();
  });

  it('shows the retry message when the stats cannot be read and reads again on retry', async () => {
    const statsStore = {
      stats: vi
        .fn<StatsStore['stats']>()
        .mockRejectedValueOnce(new Error('blocked'))
        .mockImplementation(async (instruments) => instrumentStats(instruments, [])),
    };
    renderCard([guitar], { statsStore });
    fireEvent.click(toggle());
    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj jeszcze raz' }));
    expect(await list()).toBeInTheDocument();
    expect(statsStore.stats).toHaveBeenCalledTimes(2);
  });
});

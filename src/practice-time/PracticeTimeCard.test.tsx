import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../storage/index.ts';
import { RETRY_MESSAGE } from './copy.ts';
import { PracticeTimeCard } from './PracticeTimeCard.tsx';
import { createIndexedDbPracticeTimeStore, type PracticeTimeStore } from './practiceTimeStore.ts';

let counter = 0;
const uniqueName = () => `grajek-card-test-${Date.now()}-${(counter += 1)}`;
const storeOn = (name: string) => createIndexedDbPracticeTimeStore((onClose) => openDb({ name, onClose }));

// 2026-10-14 is a Wednesday (ISO weekday 3, "środa").
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

const timeInput = () => screen.getByLabelText('O której ćwiczysz?');
const placeInput = () => screen.getByLabelText('Gdzie ćwiczysz?');
const saveButton = () => screen.getByRole('button', { name: 'Zapisz' });

beforeEach(() => {
  // Fake only the clock: IndexedDB in tests still needs real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

async function openEditorOnEmptyStore(store: PracticeTimeStore = storeOn(uniqueName())) {
  render(<PracticeTimeCard store={store} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ustal porę ćwiczeń' }));
  return store;
}

describe('PracticeTimeCard', () => {
  it('shows the set button when no practice time is saved', async () => {
    render(<PracticeTimeCard store={storeOn(uniqueName())} />);
    expect(await screen.findByRole('button', { name: 'Ustal porę ćwiczeń' })).toBeInTheDocument();
    expect(screen.queryByText(/Dziś:/)).not.toBeInTheDocument();
  });

  it('opens the editor prefilled with the default slot', async () => {
    await openEditorOnEmptyStore();
    expect(timeInput()).toHaveValue('17:00');
    expect(placeInput()).toHaveValue('W domu');
    expect(screen.getByRole('group', { name: 'Inna pora w wybrane dni' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'poniedziałek' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'niedziela' })).toHaveTextContent('Nd');
  });

  it('saves 16:30 "U babci", shows it as today\'s slot and persists it', async () => {
    const name = uniqueName();
    const store = await openEditorOnEmptyStore(storeOn(name));
    fireEvent.change(timeInput(), { target: { value: '16:30' } });
    fireEvent.change(placeInput(), { target: { value: 'U babci' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText('Dziś: 16:30 · U babci')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zmień' })).toBeInTheDocument();
    expect(await store.load()).toMatchObject({ default: { time: '16:30', place: 'U babci' }, overrides: {} });
  });

  it('shows the override for today\'s weekday instead of the default', async () => {
    const store = await openEditorOnEmptyStore();
    fireEvent.click(screen.getByRole('button', { name: 'środa' }));
    expect(screen.getByRole('button', { name: 'środa' })).toHaveAttribute('aria-pressed', 'true');

    const dayTime = screen.getByLabelText('O której ćwiczysz – środa?');
    const dayPlace = screen.getByLabelText('Gdzie ćwiczysz – środa?');
    expect(dayTime).toHaveValue('17:00');
    expect(dayPlace).toHaveValue('W domu');
    fireEvent.change(dayTime, { target: { value: '15:00' } });
    fireEvent.change(dayPlace, { target: { value: 'Szkoła' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText('Dziś: 15:00 · Szkoła')).toBeInTheDocument();
    expect(await store.load()).toMatchObject({
      default: { time: '17:00', place: 'W domu' },
      overrides: { 3: { time: '15:00', place: 'Szkoła' } },
    });
  });

  it('keeps "Zapisz" disabled while the input is invalid', async () => {
    await openEditorOnEmptyStore();
    fireEvent.change(placeInput(), { target: { value: '   ' } });
    expect(saveButton()).toBeDisabled();
    fireEvent.change(placeInput(), { target: { value: 'W domu' } });
    expect(saveButton()).toBeEnabled();
  });

  it('"Anuluj" discards the edits', async () => {
    const store = storeOn(uniqueName());
    await store.save({ default: { time: '16:30', place: 'U babci' }, overrides: {} });
    render(<PracticeTimeCard store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Zmień' }));

    expect(timeInput()).toHaveValue('16:30');
    fireEvent.change(timeInput(), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));

    expect(screen.getByText('Dziś: 16:30 · U babci')).toBeInTheDocument();
    expect(await store.load()).toMatchObject({ default: { time: '16:30', place: 'U babci' } });
  });

  it('shows the retry alert and keeps the editor when saving fails', async () => {
    const failing: PracticeTimeStore = {
      load: () => Promise.resolve(null),
      save: vi.fn(() => Promise.reject(new Error('disk full'))),
    };
    await openEditorOnEmptyStore(failing);
    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(RETRY_MESSAGE);
    expect(timeInput()).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('renders nothing when loading fails', async () => {
    const load = vi.fn(() => Promise.reject(new Error('broken')));
    const { container } = render(<PracticeTimeCard store={{ load, save: vi.fn() }} />);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

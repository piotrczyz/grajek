import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App, GREETING } from './App.tsx';
import { createIndexedDbProfileStore, type ProfileStore } from './profile/index.ts';
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
    };
    render(<App store={store} />);
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
  });

  it('shows the retry message when loading fails and loads again on retry', async () => {
    const load = vi
      .fn<ProfileStore['load']>()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue(null);
    render(<App store={{ load, create: vi.fn() }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj jeszcze raz' }));

    expect(
      await screen.findByLabelText('Jak masz na imię? Może być pseudonim.'),
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogPractice } from './LogPractice.tsx';
import type { NewPractice, Practice, PracticeStore } from './practiceStore.ts';

function fakeStore(add: PracticeStore['add'] = (input: NewPractice) =>
  Promise.resolve({ id: 'p1', day: '2026-10-07', createdAt: '2026-10-07T15:00:00.000Z', ...input } as Practice)) {
  return {
    add: vi.fn(add),
    listWeek: vi.fn(() => Promise.resolve([])),
    lastDuration: vi.fn(() => Promise.resolve(null)),
  } satisfies PracticeStore;
}

function renderPanel(store = fakeStore()) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <LogPractice store={store} instrumentId="i1" initialDuration={20} onSaved={onSaved} onCancel={onCancel} />,
  );
  return { store, onSaved, onCancel };
}

describe('LogPractice', () => {
  it('shows the duration chips with the initial duration preselected', () => {
    renderPanel();
    const group = screen.getByRole('radiogroup', { name: 'Ile grałeś?' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      '5 min',
      '10 min',
      '15 min',
      '20 min',
      '30 min',
      '45 min',
      '60 min',
    ]);
    expect(screen.getByRole('radio', { name: '20 min' })).toHaveAttribute('aria-checked', 'true');
  });

  it('hides the note and emoji until "Dodaj więcej"', () => {
    renderPanel();
    const toggle = screen.getByRole('button', { name: 'Dodaj więcej' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Nad czym pracowałem?')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Jak było?' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Nad czym pracowałem?')).toHaveAttribute('maxLength', '80');
    expect(screen.getByRole('radiogroup', { name: 'Jak było?' })).toBeInTheDocument();
  });

  it('saves without the optional fields', async () => {
    const { store, onSaved } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(store.add).toHaveBeenCalledWith({ instrumentId: 'i1', durationMinutes: 20 });
  });

  it('stores the note and the emoji when filled in', async () => {
    const { store, onSaved } = renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: '45 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj więcej' }));
    fireEvent.change(screen.getByLabelText('Nad czym pracowałem?'), { target: { value: 'gamy' } });
    fireEvent.click(screen.getByRole('radio', { name: '💪' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(store.add).toHaveBeenCalledWith({
      instrumentId: 'i1',
      durationMinutes: 45,
      note: 'gamy',
      emoji: '💪',
    });
    expect(onSaved.mock.calls[0][0]).toMatchObject({ note: 'gamy', emoji: '💪' });
  });

  it('shows an alert and keeps the panel when saving fails', async () => {
    const { onSaved } = renderPanel(fakeStore(() => Promise.reject(new Error('quota'))));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Spróbuj jeszcze raz');
    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeEnabled();
    expect(screen.getByRole('radiogroup', { name: 'Ile grałeś?' })).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables "Zapisz" while saving', () => {
    renderPanel(fakeStore(() => new Promise(() => {})));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeDisabled();
  });

  it('calls onCancel', () => {
    const { onCancel, store } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(store.add).not.toHaveBeenCalled();
  });
});

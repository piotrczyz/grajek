import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BadgeStore, EarnedBadge } from './badgeStore.ts';
import { BadgesCard } from './BadgesCard.tsx';
import type { BadgeId } from './catalog.ts';

const at = '2026-10-14T15:00:00.000Z';
const badge = (id: BadgeId): EarnedBadge => ({ id, earnedAt: at });

/** A fake store whose `award` returns the queued results in turn and grows `list` with them. */
function fakeStore(...awards: BadgeId[][]): BadgeStore & { award: ReturnType<typeof vi.fn> } {
  const earned: EarnedBadge[] = [];
  const queue = [...awards];
  return {
    award: vi.fn(async () => {
      const fresh = (queue.shift() ?? []).map(badge);
      earned.push(...fresh);
      return fresh;
    }),
    list: async () => [...earned],
  };
}

const toggle = () => screen.queryByRole('button', { name: 'Moje odznaki' });
const now = () => new Date(2026, 9, 14, 17, 0);

describe('BadgesCard', () => {
  it('shows no text and no collection while nothing is earned', async () => {
    const store = fakeStore();
    const { container } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(1));
    expect(toggle()).not.toBeInTheDocument();
    expect(container).toHaveTextContent('');
  });

  it('shows one summary on mount for badges earned by earlier history', async () => {
    render(<BadgesCard savedCount={0} store={fakeStore(['days-1', 'days-10', 'time-1h'])} now={now} />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Twoje dotychczasowe ćwiczenia przyniosły Ci 3 odznaki! Zajrzyj do kolekcji.',
    );
    expect(screen.queryByText('Nowa odznaka')).not.toBeInTheDocument();
    expect(screen.queryByText('10 dni z muzyką')).not.toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
  });

  it('announces a badge earned by a save and shows the collection toggle for the first time', async () => {
    const store = fakeStore([], ['days-1']);
    const { rerender } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(1));
    expect(toggle()).not.toBeInTheDocument();

    rerender(<BadgesCard savedCount={1} store={store} now={now} />);
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Nowa odznaka'));
    expect(status).toHaveTextContent('Pierwszy dzień z muzyką');
    expect(status).toHaveTextContent('Pierwszy krok zrobiony, tak trzymaj!');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists several badges from one save in a single announcement', async () => {
    const store = fakeStore([], ['days-1', 'time-1h']);
    const { rerender } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(1));
    rerender(<BadgesCard savedCount={1} store={store} now={now} />);

    expect(await screen.findByText('Nowe odznaki')).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(within(status).getAllByRole('listitem')).toHaveLength(2);
    expect(status).toHaveTextContent('Pierwszy dzień z muzyką');
    expect(status).toHaveTextContent('Pierwsza godzina z muzyką');
    expect(screen.getAllByRole('button', { name: 'Super!' })).toHaveLength(1);
  });

  it('hides the announcement on "Super!" and after a save with nothing new', async () => {
    const store = fakeStore([], ['days-1'], [], ['time-1h']);
    const { rerender } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(1));
    rerender(<BadgesCard savedCount={1} store={store} now={now} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Super!' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Super!' })).not.toBeInTheDocument();

    rerender(<BadgesCard savedCount={2} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    rerender(<BadgesCard savedCount={3} store={store} now={now} />);
    expect(await screen.findByText('Pierwsza godzina z muzyką')).toBeInTheDocument();
    rerender(<BadgesCard savedCount={4} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(screen.getByRole('status')).toBeEmptyDOMElement());
  });

  it('lists only earned badges in the collection, with no count and no locked items', async () => {
    render(<BadgesCard savedCount={0} store={fakeStore(['time-1h', 'days-1'])} now={now} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Moje odznaki' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    const list = screen.getByRole('list', { name: 'Zdobyte odznaki' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Pierwsza godzina z muzyką');
    expect(items[1]).toHaveTextContent('Pierwszy dzień z muzyką');
    expect(list).not.toHaveTextContent(/\d+ z \d+|odznak|zablok|\?/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders nothing when storage fails, and comes back after the next save', async () => {
    const store = fakeStore(['days-1']);
    store.award.mockRejectedValueOnce(new Error('broken'));
    const { container, rerender } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());

    rerender(<BadgesCard savedCount={1} store={store} now={now} />);
    expect(await screen.findByText('Pierwszy dzień z muzyką')).toBeInTheDocument();
  });

  it('awards once on mount and once per save, with the injected clock', async () => {
    const store = fakeStore();
    const { rerender } = render(<BadgesCard savedCount={0} store={store} now={now} />);
    await act(async () => {});
    rerender(<BadgesCard savedCount={1} store={store} now={now} />);
    await waitFor(() => expect(store.award).toHaveBeenCalledTimes(2));
    expect(store.award).toHaveBeenLastCalledWith(now());
  });
});

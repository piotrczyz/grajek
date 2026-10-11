import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { createIndexedDbPracticeStore } from '../practice/index.ts';
import { createIndexedDbProfileStore } from '../profile/index.ts';

// The badges block opens the default database itself (ProfileScreen's props stay
// unchanged), so every test gets a fresh IndexedDB instead of a unique name.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const retroText = /Twoje dotychczasowe ćwiczenia przyniosły Ci/;
const toggle = () => screen.queryByRole('button', { name: 'Moje odznaki' });

async function renderHome(wrap = false) {
  if (!(await createIndexedDbProfileStore().load())) {
    await createIndexedDbProfileStore().create({ name: 'Ola', instrumentName: 'Gitara' });
  }
  const app = <App />;
  const view = render(wrap ? <StrictMode>{app}</StrictMode> : app);
  await screen.findByRole('heading', { level: 1, name: 'Cześć, Ola!' });
  return view;
}

describe('badges on the home screen', () => {
  it('announces the first badge after the first save and shows the collection toggle', async () => {
    await renderHome();
    expect(toggle()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zagrałem!' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

    expect(await screen.findByText('Nowa odznaka')).toBeInTheDocument();
    expect(screen.getByText('Pierwszy dzień z muzyką')).toBeInTheDocument();
    expect(screen.queryByText(retroText)).not.toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
  });

  it('awards earlier history once, behind one summary, and shows nothing on the next start', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await createIndexedDbPracticeStore(undefined, () => new Date(2026, 8, day, 17, 0)).add({
        instrumentId: 'gitara',
        durationMinutes: 60,
      });
    }

    const first = await renderHome(true);
    expect(await screen.findByText(retroText)).toHaveTextContent(
      'Twoje dotychczasowe ćwiczenia przyniosły Ci 3 odznaki! Zajrzyj do kolekcji.',
    );
    expect(screen.queryByText('Nowa odznaka')).not.toBeInTheDocument();
    expect(screen.queryByText('Nowe odznaki')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Moje odznaki' }));
    const list = screen.getByRole('list', { name: 'Zdobyte odznaki' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Pierwszy dzień z muzyką'),
      expect.stringContaining('Pierwsza godzina z muzyką'),
      expect.stringContaining('Pięć godzin z muzyką'),
    ]);
    first.unmount();

    await renderHome();
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    expect(screen.queryByText(retroText)).not.toBeInTheDocument();
    expect(screen.queryByText('Nowa odznaka')).not.toBeInTheDocument();
  });
});

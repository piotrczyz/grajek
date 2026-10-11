import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIndexedDbPracticeStore, type NewPractice } from '../practice/practiceStore.ts';
import type { Instrument } from '../profile/index.ts';
import { migrations, openDb } from '../storage/index.ts';
import { createIndexedDbStatsStore } from './statsStore.ts';

let counter = 0;
const uniqueName = () => `grajek-instrument-stats-test-${Date.now()}-${(counter += 1)}`;

const guitar: Instrument = { id: 'guitar', name: 'Gitara', createdAt: '2026-10-01T10:00:00.000Z' };
const piano: Instrument = { id: 'piano', name: 'Pianino', createdAt: '2026-10-02T10:00:00.000Z' };

/** A practice store (to seed sessions) and a stats store on one fresh database. */
function storesOnFreshDb() {
  let current = new Date(2026, 9, 7, 17, 0);
  const name = uniqueName();
  const practices = createIndexedDbPracticeStore(
    (onClose) => openDb({ name, onClose }),
    () => current,
  );
  const stats = createIndexedDbStatsStore((onClose) => openDb({ name, onClose }));
  const addAt = (date: Date, input: NewPractice) => {
    current = date;
    return practices.add(input);
  };
  return { name, stats, addAt };
}

describe('StatsStore', () => {
  it('returns zeros on an empty log', async () => {
    const { stats } = storesOnFreshDb();
    await expect(stats.stats([guitar])).resolves.toEqual({
      perInstrument: [{ instrument: guitar, musicDays: 0, minutes: 0 }],
      combined: { musicDays: 0, minutes: 0 },
    });
  });

  it('splits sessions on two instruments and counts a shared day once in the combined total', async () => {
    const { stats, addAt } = storesOnFreshDb();
    await addAt(new Date(2026, 9, 6, 18, 0), { instrumentId: 'guitar', durationMinutes: 20 });
    await addAt(new Date(2026, 9, 7, 8, 0), { instrumentId: 'guitar', durationMinutes: 10 });
    await addAt(new Date(2026, 9, 7, 18, 0), { instrumentId: 'piano', durationMinutes: 30 });

    await expect(stats.stats([guitar, piano])).resolves.toEqual({
      perInstrument: [
        { instrument: guitar, musicDays: 2, minutes: 30 },
        { instrument: piano, musicDays: 1, minutes: 30 },
      ],
      combined: { musicDays: 2, minutes: 60 },
    });
  });

  it('writes nothing and leaves the database version unchanged', async () => {
    const { name, stats, addAt } = storesOnFreshDb();
    await addAt(new Date(2026, 9, 7, 8, 0), { instrumentId: 'guitar', durationMinutes: 10 });
    await stats.stats([guitar]);
    const db = await openDb({ name });
    expect(db.version).toBe(migrations.length);
    expect(await db.count('practices')).toBe(1);
    db.close();
  });
});

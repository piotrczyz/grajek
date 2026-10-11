import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIndexedDbPracticeStore, type NewPractice } from '../practice/practiceStore.ts';
import { migrations, openDb } from '../storage/index.ts';
import { createIndexedDbMonthStore } from './monthStore.ts';

let counter = 0;
const uniqueName = () => `grajek-month-test-${Date.now()}-${(counter += 1)}`;

/** A practice store (to seed sessions) and a month store on one fresh database. */
function storesOnFreshDb() {
  let current = new Date(2026, 9, 14, 17, 0);
  const name = uniqueName();
  const practices = createIndexedDbPracticeStore(
    (onClose) => openDb({ name, onClose }),
    () => current,
  );
  const month = createIndexedDbMonthStore(
    (onClose) => openDb({ name, onClose }),
    () => new Date(2026, 9, 14, 12, 0),
  );
  const addAt = (date: Date, input: Partial<NewPractice> = {}) => {
    current = date;
    return practices.add({ instrumentId: 'guitar', durationMinutes: 15, ...input });
  };
  return { name, month, addAt };
}

describe('MonthStore', () => {
  it('returns the music days of the current month and excludes other months', async () => {
    const { month, addAt } = storesOnFreshDb();
    await addAt(new Date(2026, 8, 30, 23, 50)); // last day of September
    await addAt(new Date(2026, 9, 1, 0, 10));
    await addAt(new Date(2026, 9, 14, 17, 0));
    await addAt(new Date(2026, 9, 31, 23, 50));
    await addAt(new Date(2026, 10, 1, 0, 10)); // first day of November

    const days = await month.musicDaysInMonth();
    expect([...days].sort()).toEqual(['2026-10-01', '2026-10-14', '2026-10-31']);
  });

  it('counts several sessions on one day once', async () => {
    const { month, addAt } = storesOnFreshDb();
    await addAt(new Date(2026, 9, 5, 9, 0));
    await addAt(new Date(2026, 9, 5, 18, 0), { instrumentId: 'piano' });

    expect([...(await month.musicDaysInMonth())]).toEqual(['2026-10-05']);
    await expect(month.lifetime()).resolves.toEqual({ musicDays: 1, minutes: 30 });
  });

  it('reads another month when asked', async () => {
    const { month, addAt } = storesOnFreshDb();
    await addAt(new Date(2026, 8, 3, 10, 0));
    await addAt(new Date(2026, 9, 3, 10, 0));

    expect([...(await month.musicDaysInMonth(new Date(2026, 8, 20)))]).toEqual(['2026-09-03']);
  });

  it('sums lifetime minutes and distinct days across months and instruments', async () => {
    const { month, addAt } = storesOnFreshDb();
    await addAt(new Date(2025, 11, 31, 20, 0), { durationMinutes: 45 });
    await addAt(new Date(2026, 0, 1, 10, 0), { durationMinutes: 20, instrumentId: 'piano' });
    await addAt(new Date(2026, 0, 1, 18, 0), { durationMinutes: 10 });
    await addAt(new Date(2026, 9, 14, 17, 0), { durationMinutes: 600 });

    await expect(month.lifetime()).resolves.toEqual({ musicDays: 3, minutes: 675 });
  });

  it('gives an empty set and zeros on an empty database', async () => {
    const { month } = storesOnFreshDb();
    expect((await month.musicDaysInMonth()).size).toBe(0);
    await expect(month.lifetime()).resolves.toEqual({ musicDays: 0, minutes: 0 });
  });

  it('never upgrades the database: the version stays migrations.length', async () => {
    const { name, month } = storesOnFreshDb();
    await month.lifetime();
    await month.musicDaysInMonth();
    const db = await openDb({ name });
    expect(db.version).toBe(migrations.length);
    db.close();
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../storage/index.ts';
import { createIndexedDbPracticeStore, PracticeError, type NewPractice } from './practiceStore.ts';

let counter = 0;
const uniqueName = () => `grajek-practice-test-${Date.now()}-${(counter += 1)}`;

/** A store on a fresh database whose clock is set by `at(...)`. */
function storeWithClock() {
  let current = new Date(2026, 9, 7, 17, 0); // Wednesday
  const name = uniqueName();
  const store = createIndexedDbPracticeStore(
    (onClose) => openDb({ name, onClose }),
    () => current,
  );
  const at = (date: Date) => {
    current = date;
  };
  return { store, at };
}

const base: NewPractice = { instrumentId: 'instrument-1', durationMinutes: 15 };

describe('PracticeStore', () => {
  it('saves a session for today and lists it in the current week', async () => {
    const { store } = storeWithClock();
    const saved = await store.add({ ...base, durationMinutes: 20 });
    expect(saved).toMatchObject({ instrumentId: 'instrument-1', durationMinutes: 20, day: '2026-10-07' });
    expect(saved.id).toEqual(expect.any(String));
    expect(saved).not.toHaveProperty('note');
    expect(saved).not.toHaveProperty('emoji');

    await expect(store.listWeek()).resolves.toEqual([saved]);
  });

  it('excludes sessions from the previous and the next week', async () => {
    const { store, at } = storeWithClock();
    at(new Date(2026, 9, 4, 23, 30)); // previous Sunday
    await store.add(base);
    at(new Date(2026, 9, 12, 0, 10)); // next Monday
    await store.add(base);
    at(new Date(2026, 9, 5, 0, 10)); // this Monday
    const monday = await store.add(base);
    at(new Date(2026, 9, 11, 23, 50)); // this Sunday
    const sunday = await store.add(base);

    const week = await store.listWeek(new Date(2026, 9, 7, 12, 0));
    expect(week.map((p) => p.id).sort()).toEqual([monday.id, sunday.id].sort());
  });

  it('returns both sessions logged on the same day', async () => {
    const { store } = storeWithClock();
    await store.add(base);
    await store.add({ ...base, durationMinutes: 30 });
    const week = await store.listWeek();
    expect(week).toHaveLength(2);
    expect(new Set(week.map((p) => p.day))).toEqual(new Set(['2026-10-07']));
  });

  it('stores a trimmed note and an emoji, and drops an empty note', async () => {
    const { store } = storeWithClock();
    const withExtras = await store.add({ ...base, note: '  gamy C-dur ', emoji: '💪' });
    expect(withExtras).toMatchObject({ note: 'gamy C-dur', emoji: '💪' });
    const emptyNote = await store.add({ ...base, note: '   ' });
    expect(emptyNote).not.toHaveProperty('note');
  });

  it.each([
    ['zero minutes', { durationMinutes: 0 }, 'duration'],
    ['601 minutes', { durationMinutes: 601 }, 'duration'],
    ['a non-integer duration', { durationMinutes: 12.5 }, 'duration'],
    ['a note longer than 80 characters', { note: 'a'.repeat(81) }, 'note-too-long'],
    ['an unknown emoji', { emoji: '😡' }, 'emoji'],
    ['an empty instrument id', { instrumentId: ' ' }, 'instrument-empty'],
  ])('rejects %s', async (_label, override, reason) => {
    const { store } = storeWithClock();
    const result = store.add({ ...base, ...override });
    await expect(result).rejects.toBeInstanceOf(PracticeError);
    await expect(result).rejects.toMatchObject({ code: 'invalid', reason });
    await expect(store.listWeek()).resolves.toEqual([]);
  });

  it('accepts the duration and note limits', async () => {
    const { store } = storeWithClock();
    await expect(store.add({ ...base, durationMinutes: 1 })).resolves.toBeDefined();
    await expect(store.add({ ...base, durationMinutes: 600, note: 'a'.repeat(80) })).resolves.toBeDefined();
  });

  it('returns null as the last duration when nothing was logged', async () => {
    const { store } = storeWithClock();
    await expect(store.lastDuration()).resolves.toBeNull();
  });

  it('returns the duration of the most recently saved session', async () => {
    const { store, at } = storeWithClock();
    at(new Date(2026, 9, 6, 18, 0));
    await store.add({ ...base, durationMinutes: 45 });
    at(new Date(2026, 9, 7, 8, 0));
    await store.add({ ...base, durationMinutes: 10 });
    at(new Date(2026, 9, 7, 19, 0));
    await store.add({ ...base, durationMinutes: 30 });
    at(new Date(2026, 9, 7, 12, 0));
    await store.add({ ...base, durationMinutes: 5 });
    // Latest by time of saving on the latest day: 19:00 → 30 minutes.
    await expect(store.lastDuration()).resolves.toBe(30);
  });

  it('returns null as the last practice when nothing was logged', async () => {
    const { store } = storeWithClock();
    await expect(store.lastPractice()).resolves.toBeNull();
  });

  it('returns the session of the latest day as the last practice', async () => {
    const { store, at } = storeWithClock();
    at(new Date(2026, 9, 7, 20, 0));
    await store.add({ instrumentId: 'piano', durationMinutes: 20 });
    at(new Date(2026, 9, 8, 7, 0));
    const latest = await store.add({ instrumentId: 'guitar', durationMinutes: 10 });
    await expect(store.lastPractice()).resolves.toEqual(latest);
  });

  it('returns the latest saved session within the latest day as the last practice', async () => {
    const { store, at } = storeWithClock();
    at(new Date(2026, 9, 7, 19, 0));
    const latest = await store.add({ instrumentId: 'guitar', durationMinutes: 30 });
    at(new Date(2026, 9, 7, 8, 0));
    await store.add({ instrumentId: 'piano', durationMinutes: 5 });
    await expect(store.lastPractice()).resolves.toEqual(latest);
  });
  describe('a chosen day', () => {
    it.each([
      ['yesterday', '2026-10-06'],
      ['3 days back', '2026-10-04'],
      ['today, given explicitly', '2026-10-07'],
    ])('accepts %s', async (_label, day) => {
      const { store } = storeWithClock();
      const saved = await store.add({ ...base, day });
      expect(saved.day).toBe(day);
      expect(saved.createdAt).toBe(new Date(2026, 9, 7, 17, 0).toISOString());
    });

    it('stamps today at save time when no day is given', async () => {
      const { store, at } = storeWithClock();
      at(new Date(2026, 9, 8, 0, 5));
      await expect(store.add(base)).resolves.toMatchObject({ day: '2026-10-08' });
    });

    it.each([
      ['4 days back', '2026-10-03'],
      ['tomorrow', '2026-10-08'],
      ['a malformed day', '2026-10-6'],
      ['an empty day', ''],
    ])('rejects %s with reason day', async (_label, day) => {
      const { store } = storeWithClock();
      const result = store.add({ ...base, day });
      await expect(result).rejects.toBeInstanceOf(PracticeError);
      await expect(result).rejects.toMatchObject({ code: 'invalid', reason: 'day' });
      await expect(store.listWeek(new Date(2026, 9, 1, 12, 0))).resolves.toEqual([]);
      await expect(store.listWeek()).resolves.toEqual([]);
    });

    it('lists a Saturday saved on Monday in the previous week, not this one', async () => {
      const { store, at } = storeWithClock();
      at(new Date(2026, 9, 12, 9, 0)); // Monday
      const saturday = await store.add({ ...base, day: '2026-10-10' });
      await expect(store.listWeek()).resolves.toEqual([]);
      await expect(store.listWeek(new Date(2026, 9, 10, 12, 0))).resolves.toEqual([saturday]);
    });
  });
});

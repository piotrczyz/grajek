import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../storage/index.ts';
import { createIndexedDbPracticeTimeStore, PracticeTimeError } from './practiceTimeStore.ts';

let counter = 0;
const uniqueName = () => `grajek-pt-test-${Date.now()}-${(counter += 1)}`;
const storeOn = (name: string) => createIndexedDbPracticeTimeStore((onClose) => openDb({ name, onClose }));

describe('createIndexedDbPracticeTimeStore', () => {
  it('loads null when no practice time is saved', async () => {
    expect(await storeOn(uniqueName()).load()).toBeNull();
  });

  it('saves, stamps updatedAt and loads the record through a fresh store', async () => {
    const name = uniqueName();
    const saved = await storeOn(name).save({
      default: { time: '16:30', place: ' U babci ' },
      overrides: { 2: { time: '18:00', place: 'Szkoła' } },
    });
    expect(saved.default).toEqual({ time: '16:30', place: 'U babci' });
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);

    expect(await storeOn(name).load()).toEqual(saved);
  });

  it('replaces the previous record on save', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    await store.save({ default: { time: '16:30', place: 'U babci' }, overrides: { 2: { time: '18:00', place: 'Szkoła' } } });
    const second = await store.save({ default: { time: '08:00', place: 'W domu' }, overrides: {} });

    expect(await store.load()).toEqual(second);
    const db = await openDb({ name });
    expect(await db.count('practiceTime')).toBe(1);
    db.close();
  });

  it('rejects invalid input with PracticeTimeError and writes nothing', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    const attempt = store.save({ default: { time: '24:00', place: 'W domu' }, overrides: {} });
    await expect(attempt).rejects.toBeInstanceOf(PracticeTimeError);
    await expect(attempt).rejects.toMatchObject({ code: 'invalid', reason: 'time-invalid' });
    expect(await store.load()).toBeNull();
  });
});

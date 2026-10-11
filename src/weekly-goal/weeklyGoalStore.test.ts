import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIndexedDbProfileStore } from '../profile/profileStore.ts';
import { openDb } from '../storage/index.ts';
import { createIndexedDbWeeklyGoalStore, WeeklyGoalError } from './weeklyGoalStore.ts';

let counter = 0;
const uniqueName = () => `grajek-goal-test-${Date.now()}-${(counter += 1)}`;
// Wednesday 2026-10-14; its week starts on Monday 2026-10-12.
const wednesday = () => new Date(2026, 9, 14, 17, 0);
const storeOn = (name: string, now: () => Date = wednesday) =>
  createIndexedDbWeeklyGoalStore((onClose) => openDb({ name, onClose }), now);

describe('createIndexedDbWeeklyGoalStore', () => {
  it('loads null when no goal is set', async () => {
    expect(await storeOn(uniqueName()).load()).toBeNull();
  });

  it('saves a goal starting this week and loads it through a fresh store', async () => {
    const name = uniqueName();
    const saved = await storeOn(name).setGoal(4);
    expect(saved).toMatchObject({ daysPerWeek: 4, since: '2026-10-12' });
    expect(saved.raiseDeclinedWeek).toBeUndefined();
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);

    expect(await storeOn(name).load()).toEqual(saved);
  });

  it.each([0, 7, 3.5])('rejects %s with WeeklyGoalError and writes nothing', async (days) => {
    const store = storeOn(uniqueName());
    const attempt = store.setGoal(days);
    await expect(attempt).rejects.toBeInstanceOf(WeeklyGoalError);
    await expect(attempt).rejects.toMatchObject({ code: 'invalid' });
    expect(await store.load()).toBeNull();
  });

  it('declineRaise keeps the goal and remembers this week', async () => {
    const name = uniqueName();
    await storeOn(name, () => new Date(2026, 8, 16, 12, 0)).setGoal(3);
    const declined = await storeOn(name).declineRaise();
    expect(declined).toMatchObject({ daysPerWeek: 3, since: '2026-09-14', raiseDeclinedWeek: '2026-10-12' });
    expect(await storeOn(name).load()).toEqual(declined);
  });

  it('setGoal clears a declined raise and restarts the goal this week', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    await store.setGoal(3);
    await store.declineRaise();
    const raised = await store.setGoal(4);
    expect(raised).toMatchObject({ daysPerWeek: 4, since: '2026-10-12' });
    expect(raised.raiseDeclinedWeek).toBeUndefined();
    expect(await store.load()).toEqual(raised);
  });

  it('declineRaise rejects with missing when no goal is set', async () => {
    const store = storeOn(uniqueName());
    await expect(store.declineRaise()).rejects.toMatchObject({ code: 'missing' });
    expect(await store.load()).toBeNull();
  });

  it('loads an unusable stored record as null', async () => {
    const name = uniqueName();
    const db = await openDb({ name });
    await db.put('profile', { daysPerWeek: 7, since: '2026-10-12', updatedAt: 'x' }, 'weeklyGoal');
    db.close();
    expect(await storeOn(name).load()).toBeNull();
  });

  it('coexists with the Profile in the same store', async () => {
    const name = uniqueName();
    const profiles = createIndexedDbProfileStore((onClose) => openDb({ name, onClose }));
    const profile = await profiles.create({ name: 'Ola', instrumentName: 'Gitara' });
    await storeOn(name).setGoal(4);

    expect(await createIndexedDbProfileStore((onClose) => openDb({ name, onClose })).load()).toEqual(profile);
    expect(await storeOn(name).load()).toMatchObject({ daysPerWeek: 4 });
  });
});

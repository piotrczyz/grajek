import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIndexedDbPracticeStore } from '../practice/practiceStore.ts';
import { openDb } from '../storage/index.ts';
import { createIndexedDbWeeklyGoalStore } from '../weekly-goal/weeklyGoalStore.ts';
import { createIndexedDbBadgeStore } from './badgeStore.ts';

let counter = 0;
const uniqueName = () => `grajek-badges-test-${Date.now()}-${(counter += 1)}`;
// Wednesday 2026-10-14; its week starts on Monday 2026-10-12.
const wednesday = () => new Date(2026, 9, 14, 17, 0);
const open = (name: string) => (onClose: () => void) => openDb({ name, onClose });
const badgesOn = (name: string, now: () => Date = wednesday) => createIndexedDbBadgeStore(open(name), now);
const goalsOn = (name: string, now: () => Date) => createIndexedDbWeeklyGoalStore(open(name), now);

async function practise(name: string, at: Date, durationMinutes = 15) {
  await createIndexedDbPracticeStore(open(name), () => at).add({ instrumentId: 'gitara', durationMinutes });
}

const ids = (badges: readonly { id: string }[]) => badges.map((badge) => badge.id);

async function rawRecord(name: string, key: string) {
  const db = await openDb({ name });
  try {
    return await db.get('profile', key);
  } finally {
    db.close();
  }
}

async function putRaw(name: string, key: string, value: unknown) {
  const db = await openDb({ name });
  try {
    await db.put('profile', value, key);
  } finally {
    db.close();
  }
}

describe('createIndexedDbBadgeStore', () => {
  it('awards nothing and writes nothing for an empty history', async () => {
    const name = uniqueName();
    expect(await badgesOn(name).award()).toEqual([]);
    expect(await badgesOn(name).list()).toEqual([]);
    expect(await rawRecord(name, 'badges')).toBeUndefined();
  });

  it('awards the first day badge with the award time', async () => {
    const name = uniqueName();
    await practise(name, wednesday());
    expect(await badgesOn(name).award()).toEqual([{ id: 'days-1', earnedAt: wednesday().toISOString() }]);
  });

  it('awards 5 hours once, when the total crosses 300 minutes', async () => {
    const name = uniqueName();
    const store = badgesOn(name);
    await practise(name, wednesday(), 240);
    expect(ids(await store.award())).toEqual(['days-1', 'time-1h']);
    await practise(name, wednesday(), 59);
    expect(await store.award()).toEqual([]);
    await practise(name, wednesday(), 1);
    expect(ids(await store.award())).toEqual(['time-5h']);
    expect(await store.award()).toEqual([]);
    expect(ids(await store.list())).toEqual(['days-1', 'time-1h', 'time-5h']);
  });

  it('awards each badge once when two awards run at the same time', async () => {
    const name = uniqueName();
    await practise(name, wednesday(), 60);
    const [first, second] = await Promise.all([badgesOn(name).award(), badgesOn(name).award()]);
    expect([...ids(first), ...ids(second)].sort()).toEqual(['days-1', 'time-1h']);
    expect(ids(await badgesOn(name).list())).toEqual(['days-1', 'time-1h']);
  });

  it('keeps earned badges through a fresh store', async () => {
    const name = uniqueName();
    await practise(name, wednesday());
    const earned = await badgesOn(name).award();
    expect(await badgesOn(name).list()).toEqual(earned);
  });

  it('keeps reached weeks counted after the goal changes', async () => {
    const name = uniqueName();
    // Goal of 2 set in the week of Monday 2026-10-05, reached on Mon and Tue.
    const monday = new Date(2026, 9, 5, 12, 0);
    await goalsOn(name, () => monday).setGoal(2);
    await practise(name, monday);
    await practise(name, new Date(2026, 9, 6, 12, 0));
    expect(ids(await badgesOn(name, () => monday).award())).toContain('weeks-1');

    // A raise to 3 moves `since` to the current week; the earlier week stays remembered.
    await goalsOn(name, wednesday).setGoal(3);
    expect(await badgesOn(name).award()).toEqual([]);
    expect(await rawRecord(name, 'badges')).toMatchObject({ reachedWeeks: ['2026-10-05'] });
  });

  it('repairs a malformed record without dropping valid entries', async () => {
    const name = uniqueName();
    await putRaw(name, 'badges', {
      earned: [{ id: 'days-1', earnedAt: '2026-01-01T10:00:00.000Z' }, { id: 'bogus', earnedAt: 'x' }, 'junk', null],
      reachedWeeks: ['2026-10-05', 7, 'nope'],
    });
    await practise(name, wednesday());
    // `days-1` stays as earned before; the kept remembered week now earns `weeks-1`.
    expect(ids(await badgesOn(name).award())).toEqual(['weeks-1']);
    const kept = { id: 'days-1', earnedAt: '2026-01-01T10:00:00.000Z' };
    const week = { id: 'weeks-1', earnedAt: wednesday().toISOString() };
    expect(await badgesOn(name).list()).toEqual([kept, week]);
    expect(await rawRecord(name, 'badges')).toMatchObject({ earned: [kept, week], reachedWeeks: ['2026-10-05'] });
  });

  it('treats an unusable record as empty', async () => {
    const name = uniqueName();
    await putRaw(name, 'badges', 'garbage');
    expect(await badgesOn(name).list()).toEqual([]);
    await practise(name, wednesday());
    expect(ids(await badgesOn(name).award())).toEqual(['days-1']);
  });

  it('never touches the profile and weekly goal keys', async () => {
    const name = uniqueName();
    const profile = { name: 'Ola', instrument: { id: 'gitara', name: 'Gitara' } };
    await putRaw(name, 'current', profile);
    const goal = await goalsOn(name, wednesday).setGoal(1);
    await practise(name, wednesday(), 60);
    expect(ids(await badgesOn(name).award())).toEqual(['days-1', 'time-1h', 'weeks-1']);
    expect(await rawRecord(name, 'current')).toEqual(profile);
    expect(await rawRecord(name, 'weeklyGoal')).toEqual(goal);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createIndexedDbProfileStore } from '../profile/profileStore.ts';
import { DB_NAME, openDb } from './db.ts';
import { migrations, type Migration } from './migrations.ts';

let counter = 0;
const uniqueName = () => `grajek-test-${Date.now()}-${(counter += 1)}`;

describe('openDb', () => {
  it('uses the grajek database name by default', () => {
    expect(DB_NAME).toBe('grajek');
  });

  it('opens a fresh database at migrations.length with the shipped migrations', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.version).toBe(migrations.length);
    expect(db.version).toBe(5);
    expect(Array.from(db.objectStoreNames).sort()).toEqual([
      'device',
      'instruments',
      'practiceTime',
      'practices',
      'profile',
    ]);
    db.close();
  });

  it('runs an injected migration list in order on a fresh database', async () => {
    const order: string[] = [];
    const list: Migration[] = [
      (db) => {
        order.push('first');
        db.createObjectStore('first');
      },
      (db) => {
        order.push('second');
        db.createObjectStore('second');
      },
    ];
    const db = await openDb({ name: uniqueName(), migrations: list });
    expect(db.version).toBe(2);
    expect(order).toEqual(['first', 'second']);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['first', 'second']);
    db.close();
  });

  it('re-opening a version-1 database with a longer list runs only the new migration', async () => {
    const name = uniqueName();
    const first = vi.fn<Migration>((db) => {
      db.createObjectStore('first');
    });
    const v1 = await openDb({ name, migrations: [first] });
    expect(v1.version).toBe(1);
    v1.close();

    const second = vi.fn<Migration>((db) => {
      db.createObjectStore('second');
    });
    const v2 = await openDb({ name, migrations: [first, second] });
    expect(v2.version).toBe(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(Array.from(v2.objectStoreNames).sort()).toEqual(['first', 'second']);
    v2.close();
  });

  it('rejects an empty migration list', async () => {
    await expect(openDb({ name: uniqueName(), migrations: [] })).rejects.toThrow(
      'At least one migration is required',
    );
  });
});

describe('shipped migrations', () => {
  it('starts with an empty v1 and v2 creating the profile stores', async () => {
    const db = await openDb({ name: uniqueName(), migrations: migrations.slice(0, 2) });
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['instruments', 'profile']);
    const tx = db.transaction(['profile', 'instruments']);
    expect(tx.objectStore('profile').keyPath).toBeNull();
    expect(tx.objectStore('instruments').keyPath).toBe('id');
    await tx.done;
    db.close();
  });

  it('upgrades a version-1 database to the current version', async () => {
    const name = uniqueName();
    const v1 = await openDb({ name, migrations: migrations.slice(0, 1) });
    expect(v1.version).toBe(1);
    expect(v1.objectStoreNames.length).toBe(0);
    v1.close();

    const latest = await openDb({ name });
    expect(latest.version).toBe(migrations.length);
    expect(Array.from(latest.objectStoreNames).sort()).toEqual([
      'device',
      'instruments',
      'practiceTime',
      'practices',
      'profile',
    ]);
    latest.close();
  });

  it('v3 adds the practiceTime store with out-of-line keys', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.objectStoreNames.contains('practiceTime')).toBe(true);
    const tx = db.transaction('practiceTime');
    expect(tx.objectStore('practiceTime').keyPath).toBeNull();
    await tx.done;
    db.close();
  });

  it('v4 adds the practices store keyed by id with a non-unique byDay index', async () => {
    const db = await openDb({ name: uniqueName() });
    const tx = db.transaction('practices');
    const practices = tx.objectStore('practices');
    expect(practices.keyPath).toBe('id');
    expect(Array.from(practices.indexNames)).toEqual(['byDay']);
    expect(practices.index('byDay').keyPath).toBe('day');
    expect(practices.index('byDay').unique).toBe(false);
    await tx.done;
    db.close();
  });

  it('upgrades a version-3 database to version 4 keeping the practice time', async () => {
    const name = uniqueName();
    const v3 = await openDb({ name, migrations: migrations.slice(0, 3) });
    await v3.put('practiceTime', { days: [1], time: '17:00' }, 'current');
    v3.close();

    const v4 = await openDb({ name, migrations: migrations.slice(0, 4) });
    expect(v4.version).toBe(4);
    expect(v4.objectStoreNames.contains('practices')).toBe(true);
    expect(await v4.get('practiceTime', 'current')).toEqual({ days: [1], time: '17:00' });
    v4.close();
  });

  it('upgrades a populated version-2 database to the latest version keeping its profile rows', async () => {
    const name = uniqueName();
    const v2 = await openDb({ name, migrations: migrations.slice(0, 2) });
    await v2.put('profile', { name: 'Ola', createdAt: '2026-10-11T10:00:00.000Z' }, 'current');
    await v2.put('instruments', { id: 'i1', name: 'Gitara', createdAt: '2026-10-11T10:00:00.000Z' });
    v2.close();

    const latest = await openDb({ name });
    expect(latest.version).toBe(migrations.length);
    expect(latest.objectStoreNames.contains('practiceTime')).toBe(true);
    expect(latest.objectStoreNames.contains('practices')).toBe(true);
    expect(await latest.get('profile', 'current')).toEqual({
      name: 'Ola',
      createdAt: '2026-10-11T10:00:00.000Z',
    });
    expect(await latest.getAll('instruments')).toHaveLength(1);
    latest.close();
  });

  it('upgrades a version-2 database with a saved profile and the profile store still loads it', async () => {
    const name = uniqueName();
    const v2Store = createIndexedDbProfileStore((onClose) =>
      openDb({ name, migrations: migrations.slice(0, 2), onClose }),
    );
    await v2Store.create({ name: 'Ola', instrumentName: 'Gitara' });

    const latestStore = createIndexedDbProfileStore((onClose) => openDb({ name, onClose }));
    await expect(latestStore.load()).resolves.toMatchObject({
      name: 'Ola',
      instrument: { name: 'Gitara' },
    });
  });

  it('v5 adds the device store with out-of-line keys', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.version).toBe(5);
    const store = db.transaction('device').store;
    expect(store.keyPath).toBeNull();
    expect(store.autoIncrement).toBe(false);
    db.close();
  });

  it('upgrades a populated version-4 database to version 5 keeping earlier rows', async () => {
    const name = uniqueName();
    const v4 = await openDb({ name, migrations: migrations.slice(0, 4) });
    expect(v4.objectStoreNames.contains('device')).toBe(false);
    await v4.put('practiceTime', { days: [2], time: '18:00' }, 'current');
    v4.close();

    const v5 = await openDb({ name });
    expect(v5.version).toBe(5);
    expect(v5.objectStoreNames.contains('device')).toBe(true);
    expect(await v5.get('practiceTime', 'current')).toEqual({ days: [2], time: '18:00' });
    v5.close();
  });
});

describe('connection lifecycle', () => {
  it('closes itself and fires onClose when another connection opens a higher version', async () => {
    const name = uniqueName();
    const onClose = vi.fn();
    const first = await openDb({ name, migrations: migrations.slice(0, 2), onClose });

    // Would stall on `blocked` if the first connection stayed open.
    const second = await openDb({ name, migrations });
    expect(second.version).toBe(migrations.length);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(() => first.transaction('profile')).toThrow();
    second.close();
  });

  it('does not fire onClose when the owner closes the connection itself', async () => {
    const onClose = vi.fn();
    const db = await openDb({ name: uniqueName(), onClose });
    db.close();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a newer device database with a shorter list through the VersionError fallback', async () => {
    const name = uniqueName();
    const latest = await openDb({ name });
    latest.close();

    const older = await openDb({ name, migrations: migrations.slice(0, 2) });
    expect(older.version).toBe(migrations.length);
    const tx = older.transaction('profile');
    await expect(tx.objectStore('profile').get('current')).resolves.toBeUndefined();
    await tx.done;
    older.close();
  });

  it('keeps the lifecycle handling on a connection opened through the VersionError fallback', async () => {
    const name = uniqueName();
    const latest = await openDb({ name });
    latest.close();

    const onClose = vi.fn();
    const older = await openDb({ name, migrations: migrations.slice(0, 2), onClose });
    const longer: Migration[] = [...migrations, (db) => db.createObjectStore('later')];
    const newer = await openDb({ name, migrations: longer });
    expect(newer.version).toBe(migrations.length + 1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(() => older.transaction('profile')).toThrow();
    newer.close();
  });
});

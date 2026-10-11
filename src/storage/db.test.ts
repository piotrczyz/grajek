import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
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
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(['instruments', 'profile', 'practiceTime']),
    );
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

  it('upgrades a version-1 database to version 2', async () => {
    const name = uniqueName();
    const v1 = await openDb({ name, migrations: migrations.slice(0, 1) });
    expect(v1.version).toBe(1);
    expect(v1.objectStoreNames.length).toBe(0);
    v1.close();

    const v2 = await openDb({ name, migrations: migrations.slice(0, 2) });
    expect(v2.version).toBe(2);
    expect(Array.from(v2.objectStoreNames).sort()).toEqual(['instruments', 'profile']);
    v2.close();
  });

  it('v3 adds the practiceTime store with out-of-line keys', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.objectStoreNames.contains('practiceTime')).toBe(true);
    const tx = db.transaction('practiceTime');
    expect(tx.objectStore('practiceTime').keyPath).toBeNull();
    await tx.done;
    db.close();
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
    expect(await latest.get('profile', 'current')).toEqual({
      name: 'Ola',
      createdAt: '2026-10-11T10:00:00.000Z',
    });
    expect(await latest.getAll('instruments')).toHaveLength(1);
    latest.close();
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
});

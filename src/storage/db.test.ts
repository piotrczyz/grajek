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

  it('opens a fresh database at version 2 with the shipped migrations', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['instruments', 'profile']);
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
  it('has two migrations: an empty v1 and v2 creating the profile stores', async () => {
    expect(migrations).toHaveLength(2);
    const db = await openDb({ name: uniqueName(), migrations });
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

    const v2 = await openDb({ name });
    expect(v2.version).toBe(2);
    expect(Array.from(v2.objectStoreNames).sort()).toEqual(['instruments', 'profile']);
    v2.close();
  });
});

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

  it('opens a fresh database at version 1 with the shipped migrations', async () => {
    const db = await openDb({ name: uniqueName() });
    expect(db.version).toBe(1);
    expect(Array.from(db.objectStoreNames)).toEqual([]);
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
  it('has exactly one migration that creates no object store', async () => {
    expect(migrations).toHaveLength(1);
    const db = await openDb({ name: uniqueName(), migrations });
    expect(db.objectStoreNames.length).toBe(0);
    db.close();
  });
});

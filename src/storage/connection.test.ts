import 'fake-indexeddb/auto';
import type { IDBPDatabase } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { createConnection } from './connection.ts';
import { openDb } from './db.ts';
import { migrations } from './migrations.ts';

let counter = 0;
const uniqueName = () => `grajek-conn-test-${Date.now()}-${(counter += 1)}`;

describe('createConnection', () => {
  it('opens lazily and reuses the connection', async () => {
    const name = uniqueName();
    const open = vi.fn((onClose: () => void) => openDb({ name, onClose }));
    const db = createConnection(open);
    expect(open).not.toHaveBeenCalled();

    const a = await db();
    const b = await db();
    expect(a).toBe(b);
    expect(open).toHaveBeenCalledTimes(1);
    a.close();
  });

  it('retries after a failed open', async () => {
    const name = uniqueName();
    let attempts = 0;
    const db = createConnection((onClose) => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('blocked')) : openDb({ name, onClose });
    });

    await expect(db()).rejects.toThrow('blocked');
    const conn = await db();
    expect(conn.version).toBe(migrations.length);
    expect(attempts).toBe(2);
    conn.close();
  });

  it('reopens after onClose fires', async () => {
    const name = uniqueName();
    const closers: Array<() => void> = [];
    const open = vi.fn((onClose: () => void) => {
      closers.push(onClose);
      return openDb({ name, onClose });
    });
    const db = createConnection(open);

    const first = await db();
    first.close();
    closers[0]();
    const second = await db();
    expect(second).not.toBe(first);
    expect(open).toHaveBeenCalledTimes(2);
    second.close();
  });

  it('reopens at the new version after another connection upgrades the database', async () => {
    const name = uniqueName();
    // Simulates this tab's code learning the newer schema (e.g. after an update).
    let list = migrations.slice(0, 2);
    const db = createConnection((onClose) => openDb({ name, migrations: list, onClose }));
    const first: IDBPDatabase<unknown> = await db();
    expect(first.version).toBe(2);

    // Would stall on `blocked` if the cached connection stayed open.
    const upgraded = await openDb({ name, migrations });
    upgraded.close();
    list = [...migrations];

    // The old connection released itself; the getter opens a new one.
    const second = await db();
    expect(second).not.toBe(first);
    expect(second.version).toBe(migrations.length);
    second.close();
  });
});

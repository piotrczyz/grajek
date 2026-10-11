/**
 * Opens the on-device `grajek` IndexedDB database.
 *
 * The schema evolves only through the ordered list in `./migrations.ts`:
 * append a migration, never edit or reorder an existing one. The database
 * version always equals `migrations.length`.
 *
 * A connection closes itself when another connection needs to upgrade the
 * database, so an open tab never blocks a newer build's upgrade; `onClose`
 * tells the owner to drop it and reopen on demand.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { migrations as defaultMigrations, type Migration } from './migrations.ts';

export const DB_NAME = 'grajek';

export interface OpenDbOptions {
  /** Test-only override of the database name. */
  name?: string;
  /** Test-only override of the migration list. */
  migrations?: readonly Migration[];
  /**
   * Called once after this connection is closed because another connection
   * needs to upgrade the database (`blocking`) or the browser terminated it
   * (`terminated`).
   */
  onClose?: () => void;
}

export function openDb(options: OpenDbOptions = {}): Promise<IDBPDatabase<unknown>> {
  const name = options.name ?? DB_NAME;
  const list = options.migrations ?? defaultMigrations;
  if (list.length === 0) {
    return Promise.reject(new Error('At least one migration is required'));
  }

  let connection: IDBPDatabase<unknown> | null = null;
  let closed = false;
  const notifyClosed = () => {
    if (closed) return;
    closed = true;
    options.onClose?.();
  };

  return openDB<unknown>(name, list.length, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? list.length;
      for (let version = oldVersion; version < target; version += 1) {
        list[version](db, tx);
      }
    },
    blocking() {
      // Release this connection so the other connection's upgrade can run.
      connection?.close();
      notifyClosed();
    },
    terminated() {
      notifyClosed();
    },
  }).then((db) => {
    connection = db;
    return db;
  });
}

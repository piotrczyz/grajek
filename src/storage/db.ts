/**
 * Opens the on-device `grajek` IndexedDB database.
 *
 * The schema evolves only through the ordered list in `./migrations.ts`:
 * append a migration, never edit or reorder an existing one. The database
 * version always equals `migrations.length`.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { migrations as defaultMigrations, type Migration } from './migrations.ts';

export const DB_NAME = 'grajek';

export interface OpenDbOptions {
  /** Test-only override of the database name. */
  name?: string;
  /** Test-only override of the migration list. */
  migrations?: readonly Migration[];
}

export function openDb(options: OpenDbOptions = {}): Promise<IDBPDatabase<unknown>> {
  const name = options.name ?? DB_NAME;
  const list = options.migrations ?? defaultMigrations;
  if (list.length === 0) {
    return Promise.reject(new Error('At least one migration is required'));
  }
  return openDB<unknown>(name, list.length, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? list.length;
      for (let version = oldVersion; version < target; version += 1) {
        list[version](db, tx);
      }
    },
  });
}

/**
 * Ordered schema migrations of the on-device `grajek` IndexedDB database.
 *
 * Rule for every later slice: APPEND a migration to the end of the list to
 * change the schema. Never edit, remove or reorder an existing migration:
 * devices in the field have already run it, and the database version is the
 * length of this list.
 *
 * `migrations[i]` upgrades the database from version `i` to version `i + 1`.
 */
import type { IDBPDatabase, IDBPTransaction } from 'idb';

export type Migration = (
  db: IDBPDatabase<unknown>,
  tx: IDBPTransaction<unknown, string[], 'versionchange'>,
) => void;

export const migrations: readonly Migration[] = [
  // v1 "initial": intentionally empty. The skeleton stores no product data yet.
  () => {},
  // v2 "profile" (S-01): the student's single on-device Profile under the fixed
  // key `current`, and their instruments. `instruments` holds one row until
  // S-09 adds more; S-02 references a row by its `id`.
  (db) => {
    db.createObjectStore('profile');
    db.createObjectStore('instruments', { keyPath: 'id' });
  },
];

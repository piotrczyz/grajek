/**
 * Ordered schema migrations of the on-device `grajek` IndexedDB database.
 *
 * Rule for every later slice: APPEND a migration to the end of the list to
 * change the schema. Never edit, remove or reorder an existing migration:
 * devices in the field have already run it, and the database version is the
 * length of this list.
 *
 * `migrations[i]` upgrades the database from version `i` to version `i + 1`.
 *
 * Migrations are additive only: never delete or rename an existing store or
 * index. `openDb` relies on this to open a newer device database from an
 * older (rolled-back) build without upgrading it.
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
  // v3 "practice time" (S-07): the student's Pora ćwiczeń under the fixed key
  // `current`. Kept apart from `profile` on purpose: S-08 (reminders) may read
  // it and later send it off the device, and it holds no Profile data.
  (db) => {
    db.createObjectStore('practiceTime');
  },
  // v4 "practices" (S-02): one row per logged practice session (Ćwiczenie),
  // keyed by `id`. `byDay` (non-unique) indexes the local calendar date
  // `YYYY-MM-DD` so a week is one range query. Additive only, see above.
  (db) => {
    const practices = db.createObjectStore('practices', { keyPath: 'id' });
    practices.createIndex('byDay', 'day', { unique: false });
  },
  // v5 "device" (F-02): the anonymous push registration. Out-of-line keys; one
  // record under the key `registration` (see src/push/device-id.ts).
  (db) => {
    db.createObjectStore('device');
  },
];

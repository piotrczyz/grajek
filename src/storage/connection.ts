/**
 * A lazily opened, shared database connection for one store module.
 *
 * The getter opens on first use and reuses the connection afterwards. It
 * forgets the connection when the open fails (the next call retries) and when
 * the connection is closed by a version change or the browser (the next call
 * reopens at the current version).
 */
import type { IDBPDatabase } from 'idb';
import { openDb } from './db.ts';

export type OpenConnection = (onClose: () => void) => Promise<IDBPDatabase<unknown>>;

export function createConnection(
  open: OpenConnection = (onClose) => openDb({ onClose }),
): () => Promise<IDBPDatabase<unknown>> {
  let connection: Promise<IDBPDatabase<unknown>> | null = null;

  return () => {
    if (!connection) {
      const current: Promise<IDBPDatabase<unknown>> = open(() => {
        if (connection === current) connection = null;
      }).catch((error: unknown) => {
        // Let the next call try again instead of caching the failure.
        if (connection === current) connection = null;
        throw error;
      });
      connection = current;
    }
    return connection;
  };
}

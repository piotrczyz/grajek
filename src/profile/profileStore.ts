/**
 * The student's (Uczeń) single on-device Profile.
 *
 * Stored in IndexedDB through the storage contract (`src/storage`): the
 * `profile` store holds one record under the fixed key `current`, the
 * `instruments` store holds the Profile's instrument rows. Nothing here ever
 * leaves the device.
 */
import type { IDBPDatabase } from 'idb';
import { openDb } from '../storage/index.ts';

export interface Instrument {
  id: string;
  name: string;
  createdAt: string;
}

export interface Profile {
  name: string;
  instrument: Instrument;
  createdAt: string;
}

export interface NewProfile {
  name: string;
  instrumentName: string;
}

export interface ProfileStore {
  /** The saved Profile, or `null` when none exists on this device yet. */
  load(): Promise<Profile | null>;
  /** Saves the Profile and its instrument; rejects with `ProfileError` when one exists or the input is invalid. */
  create(input: NewProfile): Promise<Profile>;
}

export const NAME_MAX_LENGTH = 24;

export type ProfileInputReason =
  | 'name-empty'
  | 'name-too-long'
  | 'instrument-empty'
  | 'instrument-too-long';

export type ProfileInputResult =
  | { ok: true; value: NewProfile }
  | { ok: false; reason: ProfileInputReason };

export function validateProfileInput(input: NewProfile): ProfileInputResult {
  const name = input.name.trim();
  const instrumentName = input.instrumentName.trim();
  if (name.length === 0) return { ok: false, reason: 'name-empty' };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, reason: 'name-too-long' };
  if (instrumentName.length === 0) return { ok: false, reason: 'instrument-empty' };
  if (instrumentName.length > NAME_MAX_LENGTH) return { ok: false, reason: 'instrument-too-long' };
  return { ok: true, value: { name, instrumentName } };
}

export type ProfileErrorCode = 'exists' | 'invalid';

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  readonly reason?: ProfileInputReason;

  constructor(code: ProfileErrorCode, reason?: ProfileInputReason) {
    super(code === 'exists' ? 'A profile already exists on this device' : `Invalid profile input: ${reason}`);
    this.name = 'ProfileError';
    this.code = code;
    this.reason = reason;
  }
}

const PROFILE_STORE = 'profile';
const INSTRUMENTS_STORE = 'instruments';
const PROFILE_KEY = 'current';

interface ProfileRecord {
  name: string;
  createdAt: string;
}

export function createIndexedDbProfileStore(
  open: () => Promise<IDBPDatabase<unknown>> = () => openDb(),
): ProfileStore {
  let connection: Promise<IDBPDatabase<unknown>> | null = null;

  const db = (): Promise<IDBPDatabase<unknown>> => {
    if (!connection) {
      connection = open().catch((error: unknown) => {
        // Let the next call try again instead of caching the failure.
        connection = null;
        throw error;
      });
    }
    return connection;
  };

  return {
    async load() {
      const tx = (await db()).transaction([PROFILE_STORE, INSTRUMENTS_STORE], 'readonly');
      const [record, instruments] = await Promise.all([
        tx.objectStore(PROFILE_STORE).get(PROFILE_KEY) as Promise<ProfileRecord | undefined>,
        tx.objectStore(INSTRUMENTS_STORE).getAll() as Promise<Instrument[]>,
        tx.done,
      ]);
      if (!record) return null;
      const instrument = [...instruments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!instrument) return null;
      return { name: record.name, createdAt: record.createdAt, instrument };
    },

    async create(input) {
      const checked = validateProfileInput(input);
      if (!checked.ok) throw new ProfileError('invalid', checked.reason);

      const createdAt = new Date().toISOString();
      const instrument: Instrument = {
        id: crypto.randomUUID(),
        name: checked.value.instrumentName,
        createdAt,
      };
      const record: ProfileRecord = { name: checked.value.name, createdAt };

      // One transaction over both stores: `add` under the fixed key fails when a
      // profile exists, which aborts the whole transaction, so no instrument row
      // is ever left without its profile.
      const tx = (await db()).transaction([PROFILE_STORE, INSTRUMENTS_STORE], 'readwrite');
      try {
        await Promise.all([
          tx.objectStore(INSTRUMENTS_STORE).add(instrument),
          tx.objectStore(PROFILE_STORE).add(record, PROFILE_KEY),
          tx.done,
        ]);
      } catch (error) {
        if ((error as { name?: unknown } | null)?.name === 'ConstraintError') {
          throw new ProfileError('exists');
        }
        throw error;
      }
      return { ...record, instrument };
    },
  };
}

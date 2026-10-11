/**
 * The student's (Uczeń) single on-device Profile.
 *
 * Stored in IndexedDB through the storage contract (`src/storage`): the
 * `profile` store holds one record under the fixed key `current`, the
 * `instruments` store holds the Profile's instrument rows. Nothing here ever
 * leaves the device.
 *
 * The `profile` store also holds the weekly goal (Cel tygodniowy) under the
 * fixed key `weeklyGoal`, owned by `src/weekly-goal/`; this module never reads
 * or writes that key.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';

export interface Instrument {
  id: string;
  name: string;
  createdAt: string;
}

export interface Profile {
  name: string;
  /** The oldest instrument (the one chosen at profile creation). */
  instrument: Instrument;
  /** Every instrument of the Profile, oldest first; never empty. */
  instruments: Instrument[];
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
  /**
   * Adds an instrument to the existing Profile; rejects with `ProfileError`
   * (`missing` without a profile, `invalid` for an empty, too long or duplicate
   * name, or when `MAX_INSTRUMENTS` is reached).
   */
  addInstrument(name: string): Promise<Instrument>;
}

export const NAME_MAX_LENGTH = 24;

/** The most instruments one Profile can hold. */
export const MAX_INSTRUMENTS = 6;

export type ProfileInputReason =
  | 'name-empty'
  | 'name-too-long'
  | 'instrument-empty'
  | 'instrument-too-long'
  | 'instrument-duplicate'
  | 'instrument-limit';

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

export type InstrumentNameResult =
  | { ok: true; value: string }
  | { ok: false; reason: ProfileInputReason };

/**
 * Checks a new instrument name against the Profile's current instruments:
 * the Profile is below `MAX_INSTRUMENTS`, the trimmed name has 1-24
 * characters and is not already owned (case-insensitive).
 */
export function validateInstrumentName(
  name: string,
  existing: readonly Pick<Instrument, 'name'>[],
): InstrumentNameResult {
  const value = name.trim();
  if (existing.length >= MAX_INSTRUMENTS) return { ok: false, reason: 'instrument-limit' };
  if (value.length === 0) return { ok: false, reason: 'instrument-empty' };
  if (value.length > NAME_MAX_LENGTH) return { ok: false, reason: 'instrument-too-long' };
  const lower = value.toLocaleLowerCase('pl');
  if (existing.some((instrument) => instrument.name.trim().toLocaleLowerCase('pl') === lower)) {
    return { ok: false, reason: 'instrument-duplicate' };
  }
  return { ok: true, value };
}

export type ProfileErrorCode = 'exists' | 'invalid' | 'missing';

const ERROR_MESSAGES: Record<Exclude<ProfileErrorCode, 'invalid'>, string> = {
  exists: 'A profile already exists on this device',
  missing: 'No profile exists on this device',
};

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  readonly reason?: ProfileInputReason;

  constructor(code: ProfileErrorCode, reason?: ProfileInputReason) {
    super(code === 'invalid' ? `Invalid profile input: ${reason}` : ERROR_MESSAGES[code]);
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

export function createIndexedDbProfileStore(open?: OpenConnection): ProfileStore {
  // Opens lazily, retries after a failed open, reopens after a version change.
  const db = createConnection(open);

  return {
    async load() {
      const tx = (await db()).transaction([PROFILE_STORE, INSTRUMENTS_STORE], 'readonly');
      const [record, instruments] = await Promise.all([
        tx.objectStore(PROFILE_STORE).get(PROFILE_KEY) as Promise<ProfileRecord | undefined>,
        tx.objectStore(INSTRUMENTS_STORE).getAll() as Promise<Instrument[]>,
        tx.done,
      ]);
      if (!record) return null;
      const sorted = sortInstruments(instruments);
      const instrument = sorted[0];
      if (!instrument) return null;
      return { name: record.name, createdAt: record.createdAt, instrument, instruments: sorted };
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
      return { ...record, instrument, instruments: [instrument] };
    },

    async addInstrument(name) {
      // Check and insert in one transaction, so two adds cannot both pass the
      // duplicate or limit check.
      const tx = (await db()).transaction([PROFILE_STORE, INSTRUMENTS_STORE], 'readwrite');
      // An abort below rejects `done`; the ProfileError is what the caller gets.
      tx.done.catch(() => {});
      const instruments = tx.objectStore(INSTRUMENTS_STORE);
      const [record, existing] = await Promise.all([
        tx.objectStore(PROFILE_STORE).get(PROFILE_KEY) as Promise<ProfileRecord | undefined>,
        instruments.getAll() as Promise<Instrument[]>,
      ]);
      const refuse = (error: ProfileError): never => {
        try {
          tx.abort();
        } catch {
          // Already finished: nothing was written, so there is nothing to undo.
        }
        throw error;
      };
      if (!record) return refuse(new ProfileError('missing'));
      const checked = validateInstrumentName(name, existing);
      if (!checked.ok) return refuse(new ProfileError('invalid', checked.reason));

      // Keep "oldest first" strict even when the clock lags behind a stored row.
      const latest = sortInstruments(existing).at(-1)?.createdAt;
      let createdAt = new Date().toISOString();
      if (latest !== undefined && createdAt <= latest) {
        createdAt = new Date(Date.parse(latest) + 1).toISOString();
      }
      const instrument: Instrument = { id: crypto.randomUUID(), name: checked.value, createdAt };
      await Promise.all([instruments.add(instrument), tx.done]);
      return instrument;
    },
  };
}

function sortInstruments(instruments: readonly Instrument[]): Instrument[] {
  return [...instruments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

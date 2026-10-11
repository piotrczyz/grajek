/**
 * Persistence of the student's single Pora ćwiczeń.
 *
 * The `practiceTime` IndexedDB store (migration v3) holds one record under the
 * fixed key `current`. It holds no Profile data, so S-08 (reminders) may read
 * it without touching the `profile` store.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';
import {
  validatePracticeTime,
  type NewPracticeTime,
  type PracticeTime,
  type PracticeTimeInputReason,
} from './practiceTime.ts';

export interface PracticeTimeStore {
  /** The saved practice time, or `null` when none is set on this device yet. */
  load(): Promise<PracticeTime | null>;
  /** Validates, stamps `updatedAt` and replaces the saved practice time; rejects with `PracticeTimeError` on invalid input. */
  save(input: NewPracticeTime): Promise<PracticeTime>;
}

export type PracticeTimeErrorCode = 'invalid';

export class PracticeTimeError extends Error {
  readonly code: PracticeTimeErrorCode;
  readonly reason: PracticeTimeInputReason;

  constructor(code: PracticeTimeErrorCode, reason: PracticeTimeInputReason) {
    super(`Invalid practice time input: ${reason}`);
    this.name = 'PracticeTimeError';
    this.code = code;
    this.reason = reason;
  }
}

const PRACTICE_TIME_STORE = 'practiceTime';
const PRACTICE_TIME_KEY = 'current';

export function createIndexedDbPracticeTimeStore(open?: OpenConnection): PracticeTimeStore {
  const db = createConnection(open);

  return {
    async load() {
      const record = (await (await db()).get(PRACTICE_TIME_STORE, PRACTICE_TIME_KEY)) as
        | PracticeTime
        | undefined;
      return record ?? null;
    },

    async save(input) {
      const checked = validatePracticeTime(input);
      if (!checked.ok) throw new PracticeTimeError('invalid', checked.reason);

      const record: PracticeTime = { ...checked.value, updatedAt: new Date().toISOString() };
      await (await db()).put(PRACTICE_TIME_STORE, record, PRACTICE_TIME_KEY);
      return record;
    },
  };
}

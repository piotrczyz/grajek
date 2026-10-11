/**
 * Practice sessions (Ćwiczenie) logged by the student (Uczeń) on this device.
 *
 * Stored in the `practices` IndexedDB store (migration v4), one record per
 * session. `day` is the local calendar date at save time, so a past Dzień z
 * muzyką never moves when the device's time zone changes. Nothing here ever
 * leaves the device.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';
import { dayKey, weekDays } from './week.ts';

export interface Practice {
  id: string;
  instrumentId: string;
  durationMinutes: number;
  /** Local calendar date at save time, `YYYY-MM-DD`. */
  day: string;
  createdAt: string;
  note?: string;
  emoji?: string;
}

export interface NewPractice {
  instrumentId: string;
  durationMinutes: number;
  note?: string;
  emoji?: string;
}

export interface PracticeStore {
  /** Saves a session for today; rejects with `PracticeError` on invalid input. */
  add(input: NewPractice): Promise<Practice>;
  /** Sessions of the Monday-to-Sunday week containing `now`. */
  listWeek(now?: Date): Promise<Practice[]>;
  /** The most recently saved session (latest day, then latest save), or `null` when there is none. */
  lastPractice(): Promise<Practice | null>;
  /** Duration of the most recently saved session, or `null` when there is none. */
  lastDuration(): Promise<number | null>;
}

/** Duration chips offered in the log panel, in minutes. */
export const DURATION_CHOICES: readonly number[] = [5, 10, 15, 20, 30, 45, 60];

/** Preselected duration when nothing was logged yet. */
export const DEFAULT_DURATION = 15;

export const DURATION_MIN = 1;
export const DURATION_MAX = 600;
export const NOTE_MAX_LENGTH = 80;

/** The fixed, non-judgemental emoji a session can carry. */
export const PRACTICE_EMOJI: readonly string[] = ['😊', '🤩', '💪', '🎶', '😌'];

export type PracticeInputReason = 'instrument-empty' | 'duration' | 'note-too-long' | 'emoji';

export class PracticeError extends Error {
  readonly code: 'invalid';
  readonly reason: PracticeInputReason;

  constructor(code: 'invalid', reason: PracticeInputReason) {
    super(`Invalid practice input: ${reason}`);
    this.name = 'PracticeError';
    this.code = code;
    this.reason = reason;
  }
}

type CheckedPractice = Pick<Practice, 'instrumentId' | 'durationMinutes' | 'note' | 'emoji'>;

function validate(input: NewPractice): CheckedPractice {
  if (input.instrumentId.trim().length === 0) throw new PracticeError('invalid', 'instrument-empty');
  const duration = input.durationMinutes;
  if (!Number.isInteger(duration) || duration < DURATION_MIN || duration > DURATION_MAX) {
    throw new PracticeError('invalid', 'duration');
  }
  const note = input.note?.trim() ?? '';
  if (note.length > NOTE_MAX_LENGTH) throw new PracticeError('invalid', 'note-too-long');
  if (input.emoji !== undefined && !PRACTICE_EMOJI.includes(input.emoji)) {
    throw new PracticeError('invalid', 'emoji');
  }
  return {
    instrumentId: input.instrumentId,
    durationMinutes: duration,
    ...(note.length > 0 ? { note } : {}),
    ...(input.emoji !== undefined ? { emoji: input.emoji } : {}),
  };
}

const PRACTICES_STORE = 'practices';
const BY_DAY = 'byDay';

export function createIndexedDbPracticeStore(
  open?: OpenConnection,
  now: () => Date = () => new Date(),
): PracticeStore {
  // Opens lazily, retries after a failed open, reopens after a version change.
  const db = createConnection(open);

  async function lastPractice(): Promise<Practice | null> {
    const conn = await db();
    // The latest day first, then the latest session within that day.
    const cursor = await conn.transaction(PRACTICES_STORE).store.index(BY_DAY).openCursor(null, 'prev');
    if (!cursor) return null;
    const latestDay = (cursor.value as Practice).day;
    const sameDay = (await conn.getAllFromIndex(PRACTICES_STORE, BY_DAY, latestDay)) as Practice[];
    return sameDay.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  }

  return {
    async add(input) {
      const checked = validate(input);
      const at = now();
      const practice: Practice = {
        id: crypto.randomUUID(),
        ...checked,
        day: dayKey(at),
        createdAt: at.toISOString(),
      };
      await (await db()).add(PRACTICES_STORE, practice);
      return practice;
    },

    async listWeek(when = now()) {
      const days = weekDays(when);
      const range = IDBKeyRange.bound(days[0], days[6]);
      return (await (await db()).getAllFromIndex(PRACTICES_STORE, BY_DAY, range)) as Practice[];
    },

    lastPractice,

    async lastDuration() {
      return (await lastPractice())?.durationMinutes ?? null;
    },
  };
}

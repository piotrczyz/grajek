/**
 * Read-only queries for the month view over the `practices` store (S-02).
 *
 * Nothing here writes, and no store or index is added: the month range uses
 * the existing `byDay` index, and the lifetime total scans the records once.
 * Sessions are never deleted or edited, so the lifetime total only grows.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';
import { monthRange } from './month.ts';

export interface LifetimeTotal {
  /** Distinct days with at least one session, on any instrument. */
  musicDays: number;
  /** Sum of all session durations. */
  minutes: number;
}

export interface MonthStore {
  /** Day keys with at least one session in the month containing `now`. */
  musicDaysInMonth(now?: Date): Promise<ReadonlySet<string>>;
  /** All music days and all practice time ever logged on this device. */
  lifetime(): Promise<LifetimeTotal>;
}

interface PracticeRecord {
  day: string;
  durationMinutes: number;
}

const PRACTICES_STORE = 'practices';
const BY_DAY = 'byDay';

export function createIndexedDbMonthStore(
  open?: OpenConnection,
  now: () => Date = () => new Date(),
): MonthStore {
  // Opens lazily, retries after a failed open, reopens after a version change.
  const db = createConnection(open);

  return {
    async musicDaysInMonth(when = now()) {
      const { first, last } = monthRange(when);
      const range = IDBKeyRange.bound(first, last);
      const records = (await (await db()).getAllFromIndex(PRACTICES_STORE, BY_DAY, range)) as PracticeRecord[];
      return new Set(records.map((record) => record.day));
    },

    async lifetime() {
      const records = (await (await db()).getAll(PRACTICES_STORE)) as PracticeRecord[];
      const days = new Set<string>();
      let minutes = 0;
      for (const record of records) {
        days.add(record.day);
        minutes += record.durationMinutes;
      }
      return { musicDays: days.size, minutes };
    },
  };
}

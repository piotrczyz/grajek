/**
 * Read-only per-instrument stats over the `practices` store (S-02).
 *
 * Scans the records once per call, like the lifetime total of the month view;
 * writes nothing and adds no store or index.
 */
import type { Instrument } from '../profile/index.ts';
import { createConnection, type OpenConnection } from '../storage/index.ts';
import { instrumentStats, type InstrumentStats, type StatsPracticeRecord } from './stats.ts';

export interface StatsStore {
  /** Totals per given instrument and over every session logged on this device. */
  stats(instruments: readonly Instrument[]): Promise<InstrumentStats>;
}

const PRACTICES_STORE = 'practices';

export function createIndexedDbStatsStore(open?: OpenConnection): StatsStore {
  // Opens lazily, retries after a failed open, reopens after a version change.
  const db = createConnection(open);

  return {
    async stats(instruments) {
      const records = (await (await db()).getAll(PRACTICES_STORE)) as StatsPracticeRecord[];
      return instrumentStats(instruments, records);
    },
  };
}

/**
 * Per-instrument and combined practice totals (S-09).
 *
 * Pure: the caller passes the Profile's instruments and the practice records.
 * A Dzień z muzyką is a day with at least one session on any instrument, so the
 * combined day count is the number of distinct days over all records and may
 * be smaller than the sum of the per-instrument counts. Minutes add up plainly.
 */
import type { Instrument } from '../profile/index.ts';

export interface PracticeTotals {
  /** Distinct days with at least one session. */
  musicDays: number;
  /** Sum of the session durations. */
  minutes: number;
}

export interface InstrumentTotals extends PracticeTotals {
  instrument: Instrument;
}

export interface InstrumentStats {
  /** One row per instrument, in the order of the given instruments. */
  perInstrument: InstrumentTotals[];
  /** All records, including those of an instrument not in the list. */
  combined: PracticeTotals;
}

export interface StatsPracticeRecord {
  instrumentId: string;
  day: string;
  durationMinutes: number;
}

export function instrumentStats(
  instruments: readonly Instrument[],
  practices: readonly StatsPracticeRecord[],
): InstrumentStats {
  const byInstrument = new Map<string, { days: Set<string>; minutes: number }>(
    instruments.map((instrument) => [instrument.id, { days: new Set<string>(), minutes: 0 }]),
  );
  const allDays = new Set<string>();
  let allMinutes = 0;

  for (const practice of practices) {
    allDays.add(practice.day);
    allMinutes += practice.durationMinutes;
    const totals = byInstrument.get(practice.instrumentId);
    if (totals) {
      totals.days.add(practice.day);
      totals.minutes += practice.durationMinutes;
    }
  }

  return {
    perInstrument: instruments.map((instrument) => {
      const totals = byInstrument.get(instrument.id);
      return { instrument, musicDays: totals?.days.size ?? 0, minutes: totals?.minutes ?? 0 };
    }),
    combined: { musicDays: allDays.size, minutes: allMinutes },
  };
}

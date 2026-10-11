import { describe, expect, it } from 'vitest';
import type { Instrument } from '../profile/index.ts';
import { instrumentStats } from './stats.ts';

const guitar: Instrument = { id: 'guitar', name: 'Gitara', createdAt: '2026-10-01T10:00:00.000Z' };
const piano: Instrument = { id: 'piano', name: 'Pianino', createdAt: '2026-10-02T10:00:00.000Z' };

describe('instrumentStats', () => {
  it('counts a day with sessions on two instruments once in the combined total and once per instrument', () => {
    const stats = instrumentStats(
      [guitar, piano],
      [
        { instrumentId: 'guitar', day: '2026-10-07', durationMinutes: 15 },
        { instrumentId: 'piano', day: '2026-10-07', durationMinutes: 20 },
      ],
    );
    expect(stats.perInstrument).toEqual([
      { instrument: guitar, musicDays: 1, minutes: 15 },
      { instrument: piano, musicDays: 1, minutes: 20 },
    ]);
    expect(stats.combined).toEqual({ musicDays: 1, minutes: 35 });
  });

  it('counts distinct days per instrument and keeps the order of the instruments', () => {
    const stats = instrumentStats(
      [piano, guitar],
      [
        { instrumentId: 'guitar', day: '2026-10-06', durationMinutes: 10 },
        { instrumentId: 'guitar', day: '2026-10-06', durationMinutes: 5 },
        { instrumentId: 'guitar', day: '2026-10-07', durationMinutes: 30 },
      ],
    );
    expect(stats.perInstrument.map((row) => row.instrument.id)).toEqual(['piano', 'guitar']);
    expect(stats.perInstrument[1]).toMatchObject({ musicDays: 2, minutes: 45 });
    expect(stats.perInstrument[0]).toMatchObject({ musicDays: 0, minutes: 0 });
  });

  it('counts a session of an unknown instrument only in the combined total', () => {
    const stats = instrumentStats(
      [guitar],
      [
        { instrumentId: 'gone', day: '2026-10-05', durationMinutes: 25 },
        { instrumentId: 'guitar', day: '2026-10-07', durationMinutes: 15 },
      ],
    );
    expect(stats.perInstrument).toEqual([{ instrument: guitar, musicDays: 1, minutes: 15 }]);
    expect(stats.combined).toEqual({ musicDays: 2, minutes: 40 });
  });

  it('gives zeros for an empty log', () => {
    expect(instrumentStats([guitar, piano], [])).toEqual({
      perInstrument: [
        { instrument: guitar, musicDays: 0, minutes: 0 },
        { instrument: piano, musicDays: 0, minutes: 0 },
      ],
      combined: { musicDays: 0, minutes: 0 },
    });
  });
});

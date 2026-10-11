import { useEffect, useId, useState } from 'react';
import { formatDuration, musicDaysLabel } from '../month/month.ts';
import { instrumentIcon } from '../profile/instruments.ts';
import { MAX_INSTRUMENTS, type Instrument, type ProfileStore } from '../profile/profileStore.ts';
import { AddInstrumentForm } from './AddInstrumentForm.tsx';
import {
  ADD_INSTRUMENT_BUTTON,
  COMBINED_PREFIX,
  INSTRUMENT_EMPTY,
  INSTRUMENTS_TOGGLE,
  RETRY_BUTTON,
  RETRY_MESSAGE,
} from './copy.ts';
import type { InstrumentStats, PracticeTotals } from './stats.ts';
import { createIndexedDbStatsStore, type StatsStore } from './statsStore.ts';

type StatsState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; stats: InstrumentStats };

interface InstrumentsCardProps {
  instruments: Instrument[];
  profileStore: ProfileStore;
  onAdded(instrument: Instrument): void;
  statsStore?: StatsStore;
}

const toggleButton = 'min-h-14 w-full rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-2xl font-extrabold';
const primaryButton = 'min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950';

/** "3 dni z muzyką · 45 min", or the neutral line before the first session. */
function totalsLine({ musicDays, minutes }: PracticeTotals): string {
  return musicDays === 0 ? INSTRUMENT_EMPTY : `${musicDaysLabel(musicDays)} · ${formatDuration(minutes)}`;
}

/**
 * The student's instruments with their own and combined practice stats, and
 * adding an instrument, behind one toggle; stats are read fresh at every opening.
 */
export function InstrumentsCard({ instruments, profileStore, onAdded, statsStore: injected }: InstrumentsCardProps) {
  const [statsStore] = useState(() => injected ?? createIndexedDbStatsStore());
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [state, setState] = useState<StatsState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const sectionId = useId();

  useEffect(() => {
    if (!open) return;
    let active = true;
    statsStore.stats(instruments).then(
      (stats) => {
        if (active) setState({ kind: 'ready', stats });
      },
      () => {
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [open, statsStore, instruments, attempt]);

  const toggle = () => {
    setState({ kind: 'loading' });
    setAdding(false);
    setOpen((value) => !value);
  };

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-4">
      <button type="button" aria-expanded={open} aria-controls={sectionId} onClick={toggle} className={toggleButton}>
        {INSTRUMENTS_TOGGLE}
      </button>
      {open && (
        <div id={sectionId} className="flex w-full flex-col items-center gap-4">
          {state.kind === 'failed' && (
            <>
              <p role="alert" className="text-xl font-semibold text-amber-300">
                {RETRY_MESSAGE}
              </p>
              <button type="button" onClick={retry} className={primaryButton}>
                {RETRY_BUTTON}
              </button>
            </>
          )}
          {state.kind === 'ready' && (
            <>
              <ul aria-label={INSTRUMENTS_TOGGLE} className="flex w-full flex-col gap-3">
                {state.stats.perInstrument.map((row) => (
                  <li
                    key={row.instrument.id}
                    className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left"
                  >
                    <span aria-hidden="true" className="text-4xl">
                      {instrumentIcon(row.instrument.name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-2xl font-bold break-words">{row.instrument.name}</span>
                      <span className="text-lg font-semibold">{totalsLine(row)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {instruments.length > 1 && (
                <p className="text-xl font-semibold">{`${COMBINED_PREFIX} ${totalsLine(state.stats.combined)}`}</p>
              )}
            </>
          )}
          {adding ? (
            <AddInstrumentForm
              instruments={instruments}
              profileStore={profileStore}
              onAdded={(instrument) => {
                setAdding(false);
                onAdded(instrument);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            instruments.length < MAX_INSTRUMENTS && (
              <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
                {ADD_INSTRUMENT_BUTTON}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}

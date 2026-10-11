import { useEffect, useId, useState } from 'react';
import { dayKey, WEEKDAY_LABELS } from '../practice/week.ts';
import {
  LIFETIME_EMPTY,
  LIFETIME_PREFIX,
  MONTH_LIST_LABEL,
  MONTH_TOGGLE,
  monthCounter,
  monthDayLabel,
  RETRY_BUTTON,
  RETRY_MESSAGE,
} from './copy.ts';
import {
  formatDuration,
  leadingBlanks,
  MONTH_NAMES,
  MONTH_NAMES_GENITIVE,
  monthDays,
  musicDaysLabel,
} from './month.ts';
import { createIndexedDbMonthStore, type LifetimeTotal, type MonthStore } from './monthStore.ts';

type MonthState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; at: Date; musicDays: ReadonlySet<string>; lifetime: LifetimeTotal };

interface MonthCardProps {
  store?: MonthStore;
  now?: () => Date;
}

/** Music days are filled amber with a note; empty days stay neutral, never red (as in WeekView). */
const MUSIC_DAY_CLASS = 'bg-amber-300 text-blue-950';
const EMPTY_DAY_CLASS = 'bg-white/10 text-white';

const toggleButton = 'min-h-14 w-full rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-2xl font-extrabold';
const retryButton = 'min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950';

/** The current month and the lifetime total, behind one toggle; read fresh at every opening. */
export function MonthCard({ store: injected, now: injectedNow }: MonthCardProps = {}) {
  const [store] = useState(() => injected ?? createIndexedDbMonthStore());
  const [now] = useState(() => injectedNow ?? (() => new Date()));
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MonthState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const sectionId = useId();

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = () => {
      const at = now();
      Promise.all([store.musicDaysInMonth(at), store.lifetime()]).then(
        ([musicDays, lifetime]) => {
          if (active) setState({ kind: 'ready', at, musicDays, lifetime });
        },
        () => {
          if (active) setState({ kind: 'failed' });
        },
      );
    };
    load();
    // A PWA left open across midnight or a month end shows the new day.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, store, now, attempt]);

  const toggle = () => {
    setState({ kind: 'loading' });
    setOpen((value) => !value);
  };

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-4">
      <button type="button" aria-expanded={open} aria-controls={sectionId} onClick={toggle} className={toggleButton}>
        {MONTH_TOGGLE}
      </button>
      {open && (
        <div id={sectionId} className="flex w-full flex-col items-center gap-4">
          {state.kind === 'failed' && (
            <>
              <p role="alert" className="text-xl font-semibold text-amber-300">
                {RETRY_MESSAGE}
              </p>
              <button type="button" onClick={retry} className={retryButton}>
                {RETRY_BUTTON}
              </button>
            </>
          )}
          {state.kind === 'ready' && <MonthView {...state} />}
        </div>
      )}
    </section>
  );
}

interface MonthViewProps {
  at: Date;
  musicDays: ReadonlySet<string>;
  lifetime: LifetimeTotal;
}

function MonthView({ at, musicDays, lifetime }: MonthViewProps) {
  const days = monthDays(at);
  const today = dayKey(at);
  const genitive = MONTH_NAMES_GENITIVE[at.getMonth()];
  const blanks = leadingBlanks(at);
  const count = days.filter((day) => musicDays.has(day)).length;

  return (
    <>
      <h2 className="text-2xl font-bold">{`${MONTH_NAMES[at.getMonth()]} ${at.getFullYear()}`}</h2>
      <p className="text-xl font-semibold">{monthCounter(count)}</p>
      <div className="flex w-full flex-col gap-1">
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-sm font-semibold text-white/70">
          {WEEKDAY_LABELS.map(({ short }) => (
            <span key={short}>{short}</span>
          ))}
        </div>
        <ul aria-label={MONTH_LIST_LABEL} className="grid grid-cols-7 gap-1">
          {Array.from({ length: blanks }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden="true" />
          ))}
          {days.map((day, index) => {
            const music = musicDays.has(day);
            const isToday = day === today;
            return (
              <li
                key={day}
                aria-label={monthDayLabel(`${index + 1} ${genitive}`, music, isToday)}
                className={[
                  'flex aspect-square flex-col items-center justify-center rounded-lg text-sm leading-tight font-bold',
                  music ? MUSIC_DAY_CLASS : EMPTY_DAY_CLASS,
                  isToday ? 'ring-4 ring-white' : '',
                ].join(' ')}
              >
                <span aria-hidden="true">{index + 1}</span>
                <span aria-hidden="true" className="h-4 text-base leading-4">
                  {music ? '♪' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xl font-semibold">
        {lifetime.musicDays === 0
          ? LIFETIME_EMPTY
          : `${LIFETIME_PREFIX} ${musicDaysLabel(lifetime.musicDays)} · ${formatDuration(lifetime.minutes)}`}
      </p>
    </>
  );
}

import { useEffect, useId, useState, type FormEvent } from 'react';
import type { PracticeStore } from '../practice/index.ts';
import {
  CANCEL,
  CHANGE,
  daysUnit,
  GOAL_LABEL,
  GOAL_QUESTION,
  goalOptionLabel,
  progressLabel,
  REACHED,
  reachedDays,
  RETRY_MESSAGE,
  SAVE_GOAL,
  SET_GOAL,
  SPARE_DAY_NOTE,
  SUGGESTED_HINT,
} from './copy.ts';
import { DEFAULT_GOAL, GOAL_OPTIONS, isReached, SUGGESTED_GOALS, type WeeklyGoal } from './weeklyGoal.ts';
import { createIndexedDbWeeklyGoalStore, type WeeklyGoalStore } from './weeklyGoalStore.ts';

type CardState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'choose'; goal: WeeklyGoal | null }
  | { kind: 'progress'; goal: WeeklyGoal };

export interface WeeklyGoalCardProps {
  /** Distinct Dni z muzyką in the current week. */
  musicDayCount: number;
  now: Date;
  practiceStore: PracticeStore;
  store?: WeeklyGoalStore;
}

const primaryButton =
  'min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950 disabled:opacity-40';
const secondaryButton = 'min-h-14 rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-xl font-semibold';

const optionClass = (checked: boolean) =>
  [
    'flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 px-1 py-2 font-extrabold',
    checked ? 'border-amber-300 bg-amber-300 text-blue-950' : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

/** The student's Cel tygodniowy under the week row: pick N of 7 days, see "X z N dni", see it reached. */
export function WeeklyGoalCard({ musicDayCount, store: injected }: WeeklyGoalCardProps) {
  const [store] = useState(() => injected ?? createIndexedDbWeeklyGoalStore());
  const [state, setState] = useState<CardState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    store.load().then(
      (goal) => {
        if (active) setState(goal ? { kind: 'progress', goal } : { kind: 'choose', goal: null });
      },
      () => {
        // The home screen and logging stay usable; the card simply does not show.
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);

  if (state.kind === 'loading' || state.kind === 'failed') return null;

  if (state.kind === 'choose') {
    const { goal } = state;
    return (
      <GoalChooser
        store={store}
        current={goal}
        onSaved={(saved) => setState({ kind: 'progress', goal: saved })}
        onCancel={goal ? () => setState({ kind: 'progress', goal }) : undefined}
      />
    );
  }

  const { goal } = state;
  const reached = isReached(musicDayCount, goal.daysPerWeek);
  return (
    <section
      aria-label={GOAL_LABEL}
      className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/10 p-4"
    >
      <p className="text-xl font-semibold">{GOAL_LABEL}</p>
      <div role="status" className="flex flex-col items-center gap-1">
        {reached ? (
          <>
            <p className="rounded-2xl bg-amber-300 px-4 py-1 text-3xl font-extrabold text-blue-950">{REACHED}</p>
            <p className="text-xl font-semibold">{reachedDays(musicDayCount)}</p>
          </>
        ) : (
          <p className="text-3xl font-extrabold">{progressLabel(musicDayCount, goal.daysPerWeek)}</p>
        )}
      </div>
      <button type="button" onClick={() => setState({ kind: 'choose', goal })} className={secondaryButton}>
        {CHANGE}
      </button>
    </section>
  );
}

interface GoalChooserProps {
  store: WeeklyGoalStore;
  current: WeeklyGoal | null;
  onSaved(goal: WeeklyGoal): void;
  onCancel?: () => void;
}

function GoalChooser({ store, current, onSaved, onCancel }: GoalChooserProps) {
  const headingId = useId();
  const questionId = useId();
  const [selected, setSelected] = useState(current?.daysPerWeek ?? DEFAULT_GOAL);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onSaved(await store.setGoal(selected));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={headingId}
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white/10 p-4"
    >
      <h2 id={headingId} className="text-3xl font-extrabold">
        {SET_GOAL}
      </h2>
      <p id={questionId} className="text-xl font-semibold">
        {GOAL_QUESTION}
      </p>
      <div role="radiogroup" aria-labelledby={questionId} className="grid grid-cols-3 gap-2">
        {GOAL_OPTIONS.map((days) => {
          const checked = selected === days;
          const suggested = SUGGESTED_GOALS.includes(days);
          return (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={suggested ? `${goalOptionLabel(days)}, ${SUGGESTED_HINT}` : goalOptionLabel(days)}
              onClick={() => setSelected(days)}
              className={optionClass(checked)}
            >
              <span className="text-3xl leading-none">{days}</span>
              <span className="text-base font-semibold">{daysUnit(days)}</span>
              {suggested && <span className="text-sm font-semibold">{SUGGESTED_HINT}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-lg">{SPARE_DAY_NOTE}</p>

      {failed && (
        <p role="alert" className="text-xl font-semibold text-amber-300">
          {RETRY_MESSAGE}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={saving} className={primaryButton}>
          {SAVE_GOAL}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            {CANCEL}
          </button>
        )}
      </div>
    </form>
  );
}

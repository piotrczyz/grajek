import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  CANCEL,
  CHANGE,
  DAY_LABELS,
  dayPlaceLabel,
  dayTimeLabel,
  OTHER_DAYS,
  PLACE_LABEL,
  RETRY_MESSAGE,
  SAVE,
  SET_PRACTICE_TIME,
  TIME_LABEL,
  TODAY,
} from './copy.ts';
import {
  DEFAULT_SLOT,
  PLACE_MAX_LENGTH,
  slotFor,
  validatePracticeTime,
  WEEKDAYS,
  type NewPracticeTime,
  type PracticeSlot,
  type PracticeTime,
  type Weekday,
} from './practiceTime.ts';
import { createIndexedDbPracticeTimeStore, type PracticeTimeStore } from './practiceTimeStore.ts';
import { useUnsavedWork } from '../pwa/index.ts';

type CardState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'display'; practiceTime: PracticeTime | null }
  | { kind: 'edit'; practiceTime: PracticeTime | null };

interface PracticeTimeCardProps {
  store?: PracticeTimeStore;
}

const primaryButton =
  'min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950 disabled:opacity-40';
const secondaryButton = 'min-h-14 rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-xl font-semibold';
const inputClass = 'min-h-14 w-full rounded-2xl border-2 border-white/40 bg-white px-4 text-xl text-blue-950';

const dayToggleClass = (pressed: boolean) =>
  [
    'min-h-14 rounded-2xl border-2 text-lg font-semibold',
    pressed ? 'border-amber-300 bg-amber-300 text-blue-950' : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

export function PracticeTimeCard({ store: injected }: PracticeTimeCardProps = {}) {
  const [store] = useState(() => injected ?? createIndexedDbPracticeTimeStore());
  const [state, setState] = useState<CardState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    store.load().then(
      (practiceTime) => {
        if (active) setState({ kind: 'display', practiceTime });
      },
      () => {
        // The home screen stays usable; the card simply does not show.
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);

  if (state.kind === 'loading' || state.kind === 'failed') return null;

  if (state.kind === 'edit') {
    return (
      <PracticeTimeEditor
        store={store}
        initial={state.practiceTime}
        onSaved={(practiceTime) => setState({ kind: 'display', practiceTime })}
        onCancel={() => setState({ kind: 'display', practiceTime: state.practiceTime })}
      />
    );
  }

  const { practiceTime } = state;
  const edit = () => setState({ kind: 'edit', practiceTime });

  if (!practiceTime) {
    return (
      <section className="flex w-full max-w-sm flex-col">
        <button type="button" onClick={edit} className={primaryButton}>
          {SET_PRACTICE_TIME}
        </button>
      </section>
    );
  }

  const today = slotFor(practiceTime, new Date());
  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/10 p-4">
      <p className="text-2xl font-semibold break-words">{`${TODAY} ${today.time} · ${today.place}`}</p>
      <button type="button" onClick={edit} className={secondaryButton}>
        {CHANGE}
      </button>
    </section>
  );
}

interface PracticeTimeEditorProps {
  store: PracticeTimeStore;
  initial: PracticeTime | null;
  onSaved(practiceTime: PracticeTime): void;
  onCancel(): void;
}

function PracticeTimeEditor({ store, initial, onSaved, onCancel }: PracticeTimeEditorProps) {
  const timeId = useId();
  const placeId = useId();
  const daysLabelId = useId();
  const [draft, setDraft] = useState<NewPracticeTime>(() => ({
    default: initial?.default ?? DEFAULT_SLOT,
    overrides: { ...(initial?.overrides ?? {}) },
  }));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // The editor is an opened panel: a reload onto a new version waits until it closes.
  useUnsavedWork(true);

  const valid = validatePracticeTime(draft).ok;

  const setDefault = (patch: Partial<PracticeSlot>) =>
    setDraft((current) => ({ ...current, default: { ...current.default, ...patch } }));

  const setOverride = (day: Weekday, patch: Partial<PracticeSlot>) =>
    setDraft((current) => {
      const slot = current.overrides[day];
      if (!slot) return current;
      return { ...current, overrides: { ...current.overrides, [day]: { ...slot, ...patch } } };
    });

  const toggleDay = (day: Weekday) =>
    setDraft((current) => {
      const overrides = { ...current.overrides };
      if (overrides[day]) delete overrides[day];
      else overrides[day] = { ...current.default };
      return { ...current, overrides };
    });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onSaved(await store.save(draft));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  const selectedDays = WEEKDAYS.filter((day) => draft.overrides[day]);

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5 text-left">
      <div className="flex flex-col gap-2">
        <label htmlFor={timeId} className="text-xl font-semibold">
          {TIME_LABEL}
        </label>
        <input
          id={timeId}
          type="time"
          value={draft.default.time}
          onChange={(event) => setDefault({ time: event.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={placeId} className="text-xl font-semibold">
          {PLACE_LABEL}
        </label>
        <input
          id={placeId}
          type="text"
          value={draft.default.place}
          onChange={(event) => setDefault({ place: event.target.value })}
          maxLength={PLACE_MAX_LENGTH}
          autoComplete="off"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p id={daysLabelId} className="text-xl font-semibold">
          {OTHER_DAYS}
        </p>
        <div role="group" aria-labelledby={daysLabelId} className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => {
            const pressed = Boolean(draft.overrides[day]);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={pressed}
                aria-label={DAY_LABELS[day].full}
                onClick={() => toggleDay(day)}
                className={dayToggleClass(pressed)}
              >
                {DAY_LABELS[day].short}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDays.map((day) => (
        <DayOverrideFields
          key={day}
          day={day}
          slot={draft.overrides[day] as PracticeSlot}
          onChange={(patch) => setOverride(day, patch)}
        />
      ))}

      {failed && (
        <p role="alert" className="text-xl font-semibold text-amber-300">
          {RETRY_MESSAGE}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={!valid || saving} className={primaryButton}>
          {SAVE}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          {CANCEL}
        </button>
      </div>
    </form>
  );
}

interface DayOverrideFieldsProps {
  day: Weekday;
  slot: PracticeSlot;
  onChange(patch: Partial<PracticeSlot>): void;
}

function DayOverrideFields({ day, slot, onChange }: DayOverrideFieldsProps) {
  const timeId = useId();
  const placeId = useId();
  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border-2 border-white/20 p-3">
      <legend className="px-1 text-lg font-semibold capitalize">{DAY_LABELS[day].full}</legend>
      <label htmlFor={timeId} className="sr-only">
        {dayTimeLabel(day)}
      </label>
      <input
        id={timeId}
        type="time"
        value={slot.time}
        onChange={(event) => onChange({ time: event.target.value })}
        className={inputClass}
      />
      <label htmlFor={placeId} className="sr-only">
        {dayPlaceLabel(day)}
      </label>
      <input
        id={placeId}
        type="text"
        value={slot.place}
        onChange={(event) => onChange({ place: event.target.value })}
        maxLength={PLACE_MAX_LENGTH}
        autoComplete="off"
        className={inputClass}
      />
    </fieldset>
  );
}

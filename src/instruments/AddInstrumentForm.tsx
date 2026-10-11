import { useId, useState, type FormEvent } from 'react';
import { INSTRUMENT_PRESETS, OTHER_INSTRUMENT_ICON } from '../profile/instruments.ts';
import {
  NAME_MAX_LENGTH,
  validateInstrumentName,
  type Instrument,
  type ProfileStore,
} from '../profile/profileStore.ts';
import {
  ADD_CANCEL_BUTTON,
  ADD_CONFIRM_BUTTON,
  ADD_GROUP_LABEL,
  OTHER_INSTRUMENT,
  OTHER_INSTRUMENT_LABEL,
  RETRY_MESSAGE,
} from './copy.ts';

interface AddInstrumentFormProps {
  /** The Profile's current instruments; their presets are not offered again. */
  instruments: readonly Instrument[];
  profileStore: ProfileStore;
  onAdded(instrument: Instrument): void;
  onCancel(): void;
}

const choiceClass = (selected: boolean) =>
  [
    'flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2 text-lg font-semibold',
    selected ? 'border-amber-300 bg-amber-300 text-blue-950' : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('pl') === b.trim().toLocaleLowerCase('pl');

/** Pick a preset (one not owned yet) or type a name under "Inny", then "Dodaj". */
export function AddInstrumentForm({ instruments, profileStore, onAdded, onCancel }: AddInstrumentFormProps) {
  const groupLabelId = useId();
  const otherId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const presets = INSTRUMENT_PRESETS.filter(
    (preset) => !instruments.some((instrument) => sameName(instrument.name, preset.label)),
  );
  const name = choice === OTHER_INSTRUMENT ? other : (choice ?? '');
  const valid = validateInstrumentName(name, instruments).ok;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onAdded(await profileStore.addInstrument(name));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <p id={groupLabelId} className="text-xl font-semibold">
        {ADD_GROUP_LABEL}
      </p>
      <div role="radiogroup" aria-labelledby={groupLabelId} className="grid grid-cols-2 gap-3">
        {[...presets, { label: OTHER_INSTRUMENT, icon: OTHER_INSTRUMENT_ICON }].map((preset) => {
          const selected = choice === preset.label;
          return (
            <button
              key={preset.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(preset.label)}
              className={choiceClass(selected)}
            >
              <span aria-hidden="true" className="text-2xl">
                {preset.icon}
              </span>
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>
      {choice === OTHER_INSTRUMENT && (
        <div className="flex flex-col gap-2">
          <label htmlFor={otherId} className="text-lg font-semibold">
            {OTHER_INSTRUMENT_LABEL}
          </label>
          <input
            id={otherId}
            type="text"
            value={other}
            onChange={(event) => setOther(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            className="min-h-14 rounded-2xl border-2 border-white/40 bg-white px-4 text-xl text-blue-950"
          />
        </div>
      )}

      {failed && (
        <p role="alert" className="text-xl font-semibold text-amber-300">
          {RETRY_MESSAGE}
        </p>
      )}

      <button
        type="submit"
        disabled={!valid || saving}
        className="min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950 disabled:opacity-40"
      >
        {ADD_CONFIRM_BUTTON}
      </button>
      <button type="button" onClick={onCancel} className="min-h-14 rounded-2xl px-6 text-xl font-semibold">
        {ADD_CANCEL_BUTTON}
      </button>
    </form>
  );
}

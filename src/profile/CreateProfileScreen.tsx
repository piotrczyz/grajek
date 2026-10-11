import { useId, useState, type FormEvent } from 'react';
import { GREETING, RETRY_MESSAGE } from './copy.ts';
import { INSTRUMENT_PRESETS, OTHER_INSTRUMENT_ICON } from './instruments.ts';
import { NAME_MAX_LENGTH, validateProfileInput, type Profile, type ProfileStore } from './profileStore.ts';

const OTHER = 'Inny';

interface CreateProfileScreenProps {
  store: ProfileStore;
  onCreated(profile: Profile): void;
}

const choiceClass = (selected: boolean) =>
  [
    'flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 py-2 text-lg font-semibold',
    selected
      ? 'border-amber-300 bg-amber-300 text-blue-950'
      : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

export function CreateProfileScreen({ store, onCreated }: CreateProfileScreenProps) {
  const nameId = useId();
  const otherId = useId();
  const groupLabelId = useId();
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const instrumentName = choice === OTHER ? other : (choice ?? '');
  const valid = validateProfileInput({ name, instrumentName }).ok;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onCreated(await store.create({ name, instrumentName }));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 64 64" className="h-20 w-20 text-amber-300" fill="currentColor">
        <path d="M44 6v34.5A9 9 0 1 1 38 32V16L24 19v25.5A9 9 0 1 1 18 36V12z" />
      </svg>
      <h1 className="text-6xl font-extrabold tracking-tight">Grajek</h1>
      <p className="max-w-xs text-2xl leading-snug font-medium">{GREETING}</p>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="text-xl font-semibold">
            Jak masz na imię? Może być pseudonim.
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            className="min-h-14 rounded-2xl border-2 border-white/40 bg-white px-4 text-xl text-blue-950"
          />
        </div>

        <div className="flex flex-col gap-2">
          <p id={groupLabelId} className="text-xl font-semibold">
            Na czym grasz?
          </p>
          <div role="radiogroup" aria-labelledby={groupLabelId} className="grid grid-cols-2 gap-3">
            {[...INSTRUMENT_PRESETS, { label: OTHER, icon: OTHER_INSTRUMENT_ICON }].map((preset) => {
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
          {choice === OTHER && (
            <div className="flex flex-col gap-2">
              <label htmlFor={otherId} className="text-lg font-semibold">
                Jaki to instrument?
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
        </div>

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
          Gotowe
        </button>
      </form>
    </>
  );
}

import { useId, useState } from 'react';
import {
  CANCEL_BUTTON,
  EMOJI_LABEL,
  INSTRUMENT_LABEL,
  minutesLabel,
  MORE_TOGGLE,
  NOTE_LABEL,
  PANEL_HEADING,
  SAVE_BUTTON,
  SAVE_FAILED_MESSAGE,
} from './copy.ts';
import {
  DURATION_CHOICES,
  NOTE_MAX_LENGTH,
  PRACTICE_EMOJI,
  type Practice,
  type PracticeStore,
} from './practiceStore.ts';
import { instrumentIcon } from '../profile/instruments.ts';
import type { Instrument } from '../profile/profileStore.ts';

interface LogPracticeProps {
  store: PracticeStore;
  /** The Profile's instruments; the choice is shown only when there are several. */
  instruments: readonly Instrument[];
  /** Preselected instrument (the last used one). */
  initialInstrumentId: string;
  initialDuration: number;
  onSaved(practice: Practice): void;
  onCancel(): void;
}

const chipClass = (selected: boolean) =>
  [
    'flex min-h-14 items-center justify-center rounded-2xl border-2 px-2 text-xl font-bold',
    selected ? 'border-amber-300 bg-amber-300 text-blue-950' : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

/**
 * In-place panel to log one practice session: pick a duration and save.
 * With several instruments the panel also offers them, preselected to the last
 * used one, so saving right away still takes no extra tap.
 * The note and emoji are optional and stay collapsed until "Dodaj więcej".
 */
export function LogPractice({
  store,
  instruments,
  initialInstrumentId,
  initialDuration,
  onSaved,
  onCancel,
}: LogPracticeProps) {
  const headingId = useId();
  const instrumentLabelId = useId();
  const emojiLabelId = useId();
  const noteId = useId();
  const moreId = useId();
  const [instrumentId, setInstrumentId] = useState(initialInstrumentId);
  const [duration, setDuration] = useState(initialDuration);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const practice = await store.add({
        instrumentId,
        durationMinutes: duration,
        ...(note.trim().length > 0 ? { note } : {}),
        ...(emoji !== null ? { emoji } : {}),
      });
      onSaved(practice);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex w-full max-w-sm flex-col gap-4">
      <h2 id={headingId} className="text-3xl font-extrabold">
        {PANEL_HEADING}
      </h2>
      {instruments.length > 1 && (
        <div className="flex flex-col gap-2">
          <p id={instrumentLabelId} className="text-xl font-semibold">
            {INSTRUMENT_LABEL}
          </p>
          <div role="radiogroup" aria-labelledby={instrumentLabelId} className="grid grid-cols-2 gap-2">
            {instruments.map((instrument) => (
              <button
                key={instrument.id}
                type="button"
                role="radio"
                aria-checked={instrumentId === instrument.id}
                onClick={() => setInstrumentId(instrument.id)}
                className={`${chipClass(instrumentId === instrument.id)} gap-2 break-words`}
              >
                <span aria-hidden="true">{instrumentIcon(instrument.name)}</span>
                <span>{instrument.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div role="radiogroup" aria-labelledby={headingId} className="grid grid-cols-4 gap-2">
        {DURATION_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={duration === minutes}
            onClick={() => setDuration(minutes)}
            className={chipClass(duration === minutes)}
          >
            {minutesLabel(minutes)}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={moreId}
        onClick={() => setExpanded((open) => !open)}
        className="min-h-14 rounded-2xl px-4 text-xl font-semibold underline"
      >
        {MORE_TOGGLE}
      </button>
      {expanded && (
        <div id={moreId} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={noteId} className="text-xl font-semibold">
              {NOTE_LABEL}
            </label>
            <input
              id={noteId}
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              autoComplete="off"
              className="min-h-14 rounded-2xl border-2 border-white/40 bg-white px-4 text-xl text-blue-950"
            />
          </div>
          <div className="flex flex-col gap-2">
            <p id={emojiLabelId} className="text-xl font-semibold">
              {EMOJI_LABEL}
            </p>
            <div role="radiogroup" aria-labelledby={emojiLabelId} className="grid grid-cols-5 gap-2">
              {PRACTICE_EMOJI.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={emoji === option}
                  onClick={() => setEmoji((current) => (current === option ? null : option))}
                  className={`${chipClass(emoji === option)} text-3xl`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {failed && (
        <p role="alert" className="text-xl font-semibold text-amber-300">
          {SAVE_FAILED_MESSAGE}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950 disabled:opacity-40"
      >
        {SAVE_BUTTON}
      </button>
      <button type="button" onClick={onCancel} className="min-h-14 rounded-2xl px-6 text-xl font-semibold">
        {CANCEL_BUTTON}
      </button>
    </section>
  );
}

// Hidden spike screen "Zagraj i sprawdź" (?spike=nuty). Loaded lazily from
// main.tsx, so nothing here ends up in the main entry chunk.
import { useState } from 'react';
import * as copy from './copy.ts';
import { MELODIES, type Instrument } from './logic/index.ts';

const INSTRUMENTS: Instrument[] = ['clarinet-bb', 'c'];

export default function SpikeScreen() {
  const [melodyId, setMelodyId] = useState(MELODIES[0].id);
  const [instrument, setInstrument] = useState<Instrument>('clarinet-bb');
  const [bpm, setBpm] = useState(60);
  const [ignoreOctave, setIgnoreOctave] = useState(false);
  const [visualOnly, setVisualOnly] = useState(false);

  return (
    <main
      className="mx-auto flex h-full max-w-xl flex-col gap-4 overflow-y-auto px-4 text-left"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <h1 className="text-2xl font-bold">{copy.TITLE}</h1>
      <p className="text-sm text-slate-600">{copy.INTRO}</p>

      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{copy.MELODY_LABEL}</span>
          <select
            className="rounded border px-2 py-2"
            value={melodyId}
            onChange={(e) => setMelodyId(e.target.value)}
          >
            {MELODIES.map((melody) => (
              <option key={melody.id} value={melody.id}>
                {melody.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">{copy.INSTRUMENT_LABEL}</span>
          <select
            className="rounded border px-2 py-2"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
          >
            {INSTRUMENTS.map((id) => (
              <option key={id} value={id}>
                {copy.INSTRUMENT_NAMES[id]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">{copy.tempoLabel(bpm)}</span>
          <input
            type="range"
            min={60}
            max={100}
            step={1}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ignoreOctave}
            onChange={(e) => setIgnoreOctave(e.target.checked)}
          />
          {copy.IGNORE_OCTAVE_LABEL}
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={visualOnly} onChange={(e) => setVisualOnly(e.target.checked)} />
          {copy.VISUAL_METRONOME_LABEL}
        </label>

        <button type="button" className="rounded bg-blue-900 px-4 py-3 font-bold text-white">
          {copy.START_BUTTON}
        </button>
      </section>

      <section aria-label={copy.STAFF_HEADING}>
        <h2 className="font-semibold">{copy.STAFF_HEADING}</h2>
        <p className="text-sm text-slate-600">{copy.STAFF_EMPTY}</p>
      </section>

      <section aria-label={copy.SCORE_HEADING}>
        <h2 className="font-semibold">{copy.SCORE_HEADING}</h2>
        <p className="text-sm text-slate-600">{copy.SCORE_EMPTY}</p>
      </section>

      <section aria-label={copy.DIAGNOSTICS_HEADING}>
        <h2 className="font-semibold">{copy.DIAGNOSTICS_HEADING}</h2>
        <p className="text-sm text-slate-600">{copy.DIAGNOSTICS_EMPTY}</p>
      </section>
    </main>
  );
}

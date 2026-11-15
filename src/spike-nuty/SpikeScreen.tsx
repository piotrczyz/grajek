// Hidden spike screen "Zagraj i sprawdź" (?spike=nuty). Loaded lazily from
// main.tsx, so nothing here ends up in the main entry chunk.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMetronome, type Metronome } from './audio/metronome.ts';
import { createAudioContext, MicError, openMic, type Mic, type MicErrorKind } from './audio/mic.ts';
import { createPitchTracker, type PitchTracker } from './audio/pitchTracker.ts';
import * as copy from './copy.ts';
import { DiagnosticsPanel } from './DiagnosticsPanel.tsx';
import { Staff } from './Staff.tsx';
import { GRADE_COLOURS } from './staffModel.ts';
import {
  compare,
  eighthMs,
  MELODIES,
  melodyLengthEighths,
  quantize,
  segment,
  soundingToWritten,
  type Instrument,
  type NoteEvent,
  type PitchFrame,
} from './logic/index.ts';

const INSTRUMENTS: Instrument[] = ['clarinet-bb', 'c'];
const BEATS_PER_BAR = 4;
/** Every audible click opens a window this long that the segmenter skips. */
const CLICK_IGNORE_MS = 80;
const LIVE_REFRESH_MS = 100;

type Phase = 'idle' | 'starting' | 'recording' | 'done' | 'error';

interface Beat {
  bar: number;
  beat: number;
  isCountIn: boolean;
}

interface Session {
  ctx: AudioContext;
  mic: Mic | null;
  metronome: Metronome | null;
  tracker: PitchTracker | null;
  timers: Array<ReturnType<typeof setTimeout>>;
  live: ReturnType<typeof setInterval> | null;
}

interface Recording {
  events: NoteEvent[];
  /** The tempo the recording was made at (the slider may move afterwards). */
  bpm: number;
}

const MIC_MESSAGES: Record<MicErrorKind, string> = {
  denied: copy.MIC_DENIED,
  unavailable: copy.MIC_UNAVAILABLE,
  other: copy.MIC_OTHER,
};

export default function SpikeScreen() {
  const [melodyId, setMelodyId] = useState(MELODIES[0].id);
  const [instrument, setInstrument] = useState<Instrument>('clarinet-bb');
  const [bpm, setBpm] = useState(60);
  const [ignoreOctave, setIgnoreOctave] = useState(false);
  const [visualOnly, setVisualOnly] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [micError, setMicError] = useState<MicErrorKind | null>(null);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [live, setLive] = useState<PitchFrame | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const melody = MELODIES.find((m) => m.id === melodyId) ?? MELODIES[0];
  const busy = phase === 'starting' || phase === 'recording';

  // Sounding -> written by the instrument, quantized at the recorded tempo,
  // graded against the selected melody.
  const result = useMemo(() => {
    if (!recording) return null;
    const written = recording.events.map((e) => ({ ...e, midi: soundingToWritten(e.midi, instrument) }));
    return compare(melody, quantize(written, recording.bpm), { ignoreOctave });
  }, [recording, instrument, melody, ignoreOctave]);

  /** Tears the session down; returns what the recording captured. */
  const teardown = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return null;
    for (const timer of session.timers) clearTimeout(timer);
    if (session.live !== null) clearInterval(session.live);
    session.metronome?.stop();
    const frames = session.tracker?.frames() ?? [];
    const clicks = session.metronome?.clickTimesMs() ?? [];
    session.tracker?.stop();
    session.mic?.stop();
    void session.ctx.suspend().catch(() => undefined);
    return { frames, clicks };
  };

  const stop = (recordedBpm: number) => {
    const captured = teardown();
    setBeat(null);
    if (!captured) return;
    const ignoreWindows = captured.clicks.map((t): [number, number] => [t, t + CLICK_IGNORE_MS]);
    setRecording({ events: segment(captured.frames, { ignoreWindows }), bpm: recordedBpm });
    setPhase('done');
  };

  const start = async () => {
    if (sessionRef.current) return;
    setMicError(null);
    setRecording(null);
    setLive(null);
    setPhase('starting');
    // Both calls happen synchronously inside the tap: iOS Safari needs it.
    const ctx = ctxRef.current ?? createAudioContext();
    ctxRef.current = ctx;
    const resumed = ctx.resume();
    const session: Session = { ctx, mic: null, metronome: null, tracker: null, timers: [], live: null };
    sessionRef.current = session;
    try {
      session.mic = await openMic(ctx);
      await resumed;
    } catch (error) {
      teardown();
      setMicError(error instanceof MicError ? error.kind : 'other');
      setPhase('error');
      return;
    }
    if (sessionRef.current !== session) {
      // Stopped or unmounted while waiting for the permission.
      session.mic.stop();
      return;
    }

    const metronome = createMetronome(ctx, {
      bpm,
      beatsPerBar: BEATS_PER_BAR,
      silentAfterCountIn: visualOnly,
    });
    metronome.onBeat((bar, beatInBar, isCountIn) => setBeat({ bar, beat: beatInBar, isCountIn }));
    session.metronome = metronome;
    const downbeatSec = metronome.start();
    const tracker = createPitchTracker(ctx, session.mic.source, downbeatSec);
    session.tracker = tracker;
    setLatencyMs(tracker.latencyMs);
    session.live = setInterval(() => setLive(tracker.latest()), LIVE_REFRESH_MS);

    // Auto-stop one bar after the melody ends.
    const recordMs = (melodyLengthEighths(melody) + 2 * BEATS_PER_BAR) * eighthMs(bpm);
    const untilDownbeatMs = Math.max(0, (downbeatSec - ctx.currentTime) * 1000);
    session.timers.push(setTimeout(() => stop(bpm), untilDownbeatMs + recordMs));
    setPhase('recording');
  };

  // Stop the microphone and the metronome when the screen goes away.
  useEffect(
    () => () => {
      teardown();
    },
    [],
  );

  return (
    // White page: the app's brand background would hide the black staff.
    <div className="h-full overflow-y-auto bg-white text-slate-900">
    <main
      className="mx-auto flex max-w-xl flex-col gap-4 px-4 text-left"
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
            disabled={busy}
            onChange={(e) => setMelodyId(e.target.value)}
          >
            {MELODIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">{copy.INSTRUMENT_LABEL}</span>
          <select
            className="rounded border px-2 py-2"
            value={instrument}
            disabled={busy}
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
            disabled={busy}
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
          <input
            type="checkbox"
            checked={visualOnly}
            disabled={busy}
            onChange={(e) => setVisualOnly(e.target.checked)}
          />
          {copy.VISUAL_METRONOME_LABEL}
        </label>

        {busy ? (
          <button
            type="button"
            className="rounded bg-red-700 px-4 py-3 font-bold text-white"
            onClick={() => stop(bpm)}
          >
            {copy.STOP_BUTTON}
          </button>
        ) : (
          <button
            type="button"
            className="rounded bg-blue-900 px-4 py-3 font-bold text-white"
            onClick={() => void start()}
          >
            {copy.START_BUTTON}
          </button>
        )}

        {phase === 'starting' && <p>{copy.STARTING}</p>}
        {phase === 'recording' && (
          <div aria-live="polite" className="flex items-center gap-3">
            <span
              className={`inline-block h-6 w-6 rounded-full ${
                beat?.beat === 1 ? 'bg-red-600' : beat ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            />
            <span className="font-semibold">
              {beat === null
                ? copy.RECORDING
                : beat.isCountIn
                  ? copy.countInLabel(beat.beat)
                  : copy.beatLabel(beat.bar, beat.beat)}
            </span>
          </div>
        )}
        {phase === 'error' && micError !== null && (
          <div role="alert" className="flex flex-col gap-2 rounded border border-red-300 bg-red-50 p-3">
            <p>{MIC_MESSAGES[micError]}</p>
            <button
              type="button"
              className="self-start rounded border px-3 py-2"
              onClick={() => void start()}
            >
              {copy.RETRY_BUTTON}
            </button>
          </div>
        )}
      </section>

      <section aria-label={copy.STAFF_HEADING}>
        <h2 className="font-semibold">{copy.STAFF_HEADING}</h2>
        {result ? (
          <>
            <p className="text-xs text-slate-600">{copy.STAVES_HINT}</p>
            <Staff reference={result.reference} played={result.played} />
          </>
        ) : (
          <p className="text-sm text-slate-600">{copy.STAFF_EMPTY}</p>
        )}
      </section>

      <section aria-label={copy.SCORE_HEADING}>
        <h2 className="font-semibold">{copy.SCORE_HEADING}</h2>
        {result ? (
          <>
            <p className="text-2xl font-bold">{copy.scoreLabel(result.scorePercent)}</p>
            <p className="text-sm">{copy.pitchLabel(result.pitchPercent)}</p>
            <ul className="mt-2 text-sm">
              {copy.LEGEND.map(([grade, text]) => (
                <li key={grade} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: GRADE_COLOURS[grade] }}
                  />
                  {text}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600">{copy.SCORE_EMPTY}</p>
        )}
      </section>

      <section aria-label={copy.DIAGNOSTICS_HEADING}>
        <h2 className="font-semibold">{copy.DIAGNOSTICS_HEADING}</h2>
        {phase === 'idle' ? (
          <p className="text-sm text-slate-600">{copy.DIAGNOSTICS_EMPTY}</p>
        ) : (
          <DiagnosticsPanel live={live} instrument={instrument} events={recording?.events ?? null} latencyMs={latencyMs} />
        )}
      </section>
    </main>
    </div>
  );
}

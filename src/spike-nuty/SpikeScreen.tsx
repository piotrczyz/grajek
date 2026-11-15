// Hidden spike screen "Zagraj i sprawdź" (?spike=nuty). Loaded lazily from
// main.tsx, so nothing here ends up in the main entry chunk.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '../push/device-id.ts';
import { createMetronome, type Metronome } from './audio/metronome.ts';
import { createAudioContext, MicError, openMic, type Mic, type MicErrorKind } from './audio/mic.ts';
import { createPitchTracker, type PitchTracker } from './audio/pitchTracker.ts';
import * as copy from './copy.ts';
import { DiagnosticsPanel } from './DiagnosticsPanel.tsx';
import { Staff, type StaffSelection } from './Staff.tsx';
import { gradeColour, referenceBars, toAlignedBars } from './staffModel.ts';
import { noteRows, refIndexAt, summarize, type NoteRow } from './results.ts';
import {
  eighthMs,
  gradeRecording,
  MELODIES,
  melodyLengthEighths,
  segment,
  soundingToWritten,
  type Instrument,
  type NoteEvent,
  type PitchFrame,
} from './logic/index.ts';
import { enqueue, flush, startAutoFlush } from './telemetry/queue.ts';
import { buildAttemptRecord, readTelemetryEnv, type AttemptEnd } from './telemetry/record.ts';
import { isTelemetryEnabled, setTelemetryEnabled } from './telemetry/settings.ts';

const INSTRUMENTS: Instrument[] = ['clarinet-bb', 'c'];
const PREP_OPTIONS = [3, 5, 10];
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
  /** Client-generated id of the telemetry record for this attempt. */
  attemptId: string;
  /** Whether the auto-stop timer ('complete') or the Stop button ('stopped') ended it. */
  ended: AttemptEnd;
}

/** The telemetry record sent for a recording, as needed by its feedback. */
interface SentAttempt {
  attemptId: string;
  deviceId: string;
  /** `autoLatency` in the sent record; a different value now means the view was re-graded. */
  autoLatency: boolean;
}

type FeedbackStep = 'ask' | 'no' | 'sent';

const MAX_COMMENT = 500;

const MIC_MESSAGES: Record<MicErrorKind, string> = {
  denied: copy.MIC_DENIED,
  unavailable: copy.MIC_UNAVAILABLE,
  other: copy.MIC_OTHER,
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** The large cue a child can read from a music stand: prep seconds, count-in beats, "Graj!". */
function Cue({ prepLeft, beat }: { prepLeft: number | null; beat: Beat | null }) {
  let label: string;
  let big: string;
  let small = ' ';
  if (prepLeft !== null && prepLeft > 0) {
    label = copy.GET_READY;
    big = String(prepLeft);
  } else if (beat === null || beat.isCountIn) {
    label = copy.COUNT_IN;
    big = beat === null ? ' ' : String(beat.beat);
  } else {
    label = ' ';
    big = copy.PLAY_NOW;
    small = copy.barLabel(beat.bar);
  }
  return (
    <div aria-live="polite" className="flex flex-col items-center py-2 text-center">
      <p className="text-2xl font-bold">{label}</p>
      <p className="text-7xl font-bold tabular-nums">{big}</p>
      <p className="text-sm text-slate-600">{small}</p>
    </div>
  );
}

interface Misjudging {
  /** Row numbers marked "aplikacja się pomyliła". */
  marked: number[];
  onToggle: (nr: number) => void;
}

function NotesTable({
  rows,
  selected,
  misjudging,
}: {
  rows: NoteRow[];
  selected: StaffSelection | null;
  /** When set, every row gets a "aplikacja się pomyliła" toggle. */
  misjudging?: Misjudging;
}) {
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const isSelected = (row: NoteRow) =>
    selected !== null &&
    ((selected.refIndex !== null && row.refIndex === selected.refIndex) ||
      (selected.playedIndex !== null && row.playedIndex === selected.playedIndex));
  const selectedNr = rows.find(isSelected)?.nr ?? null;

  useEffect(() => {
    if (selectedNr === null) return;
    rowRefs.current.get(selectedNr)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selectedNr]);

  return (
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="text-left text-slate-600">
          {copy.NOTE_COLUMNS.map((column, i) => (
            <th key={column} className={i === 0 ? 'w-6' : i === 4 ? 'w-[30%]' : undefined}>
              {column}
            </th>
          ))}
          {misjudging && <th className="w-14">{copy.MISJUDGED_COLUMN}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.nr}
            ref={(el) => {
              if (el) rowRefs.current.set(row.nr, el);
              else rowRefs.current.delete(row.nr);
            }}
            className={`border-t align-top ${row.nr === selectedNr ? 'bg-blue-100' : ''}`}
          >
            <td>{row.nr}</td>
            <td>{row.expected}</td>
            <td>{row.played}</td>
            <td>{row.centsDiff === null ? copy.NONE : signed(Math.round(row.centsDiff))}</td>
            <td>{row.timing}</td>
            <td className="font-semibold" style={{ color: gradeColour(row.grade) }}>
              {row.status}
            </td>
            {misjudging && (
              <td>
                <input
                  type="checkbox"
                  aria-label={copy.misjudgedRowLabel(row.nr)}
                  checked={misjudging.marked.includes(row.nr)}
                  onChange={() => misjudging.onToggle(row.nr)}
                />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SpikeScreen() {
  const [melodyId, setMelodyId] = useState(MELODIES[0].id);
  const [instrument, setInstrument] = useState<Instrument>('clarinet-bb');
  const [bpm, setBpm] = useState(60);
  const [prepSec, setPrepSec] = useState(5);
  const [ignoreOctave, setIgnoreOctave] = useState(false);
  const [visualOnly, setVisualOnly] = useState(false);
  const [autoLatency, setAutoLatency] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [micError, setMicError] = useState<MicErrorKind | null>(null);
  const [prepLeft, setPrepLeft] = useState<number | null>(null);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [live, setLive] = useState<PitchFrame | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<StaffSelection | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [telemetryOn, setTelemetryOn] = useState(isTelemetryEnabled);
  const [sent, setSent] = useState<SentAttempt | null>(null);
  const [feedbackStep, setFeedbackStep] = useState<FeedbackStep>('ask');
  const [misjudged, setMisjudged] = useState<number[]>([]);
  const [comment, setComment] = useState('');
  /** Attempts already considered for sending: each one is sent at most once. */
  const seenAttemptsRef = useRef(new Set<string>());

  const melody = MELODIES.find((m) => m.id === melodyId) ?? MELODIES[0];
  const busy = phase === 'starting' || phase === 'recording';

  // Sounding -> written by the instrument, graded at the recorded tempo with
  // the optional onset correction.
  const graded = useMemo(() => {
    if (!recording) return null;
    const written = recording.events.map((e) => ({ ...e, midi: soundingToWritten(e.midi, instrument) }));
    return gradeRecording(melody, written, recording.bpm, { ignoreOctave, autoLatency });
  }, [recording, instrument, melody, ignoreOctave, autoLatency]);
  const result = graded?.result ?? null;

  // The reference note the child should be on right now.
  const currentRef =
    phase === 'recording' && beat !== null && !beat.isCountIn
      ? refIndexAt(melody, ((beat.bar - 1) * BEATS_PER_BAR + (beat.beat - 1)) * 2)
      : null;
  const bars = useMemo(
    () => (result ? toAlignedBars(result, melodyLengthEighths(melody)) : referenceBars(melody, currentRef)),
    [result, melody, currentRef],
  );
  const rows = useMemo(
    () => (result && recording ? noteRows(result, recording.bpm) : []),
    [result, recording],
  );

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

  const stop = (recordedBpm: number, ended: AttemptEnd) => {
    const captured = teardown();
    setBeat(null);
    setPrepLeft(null);
    if (!captured) return;
    const ignoreWindows = captured.clicks.map((t): [number, number] => [t, t + CLICK_IGNORE_MS]);
    // Nothing played during the prep time or the count-in is graded.
    const earliestMs = -eighthMs(recordedBpm) / 2;
    const frames = captured.frames.filter((frame) => frame.timeMs >= earliestMs);
    setRecording({
      events: segment(frames, { ignoreWindows }),
      bpm: recordedBpm,
      attemptId: crypto.randomUUID(),
      ended,
    });
    resetFeedback();
    setPhase('done');
  };

  const start = async () => {
    if (sessionRef.current) return;
    const leadInSec = prepSec;
    setMicError(null);
    setRecording(null);
    setSelected(null);
    setLive(null);
    setBeat(null);
    setPrepLeft(null);
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
    const downbeatSec = metronome.start(leadInSec);
    // The tracker runs from now on, so the live reading works during the prep time.
    const tracker = createPitchTracker(ctx, session.mic.source, downbeatSec);
    session.tracker = tracker;
    setLatencyMs(tracker.latencyMs);
    session.live = setInterval(() => setLive(tracker.latest()), LIVE_REFRESH_MS);

    // Prep countdown, one second per step; Stop clears the pending steps.
    setPrepLeft(leadInSec);
    for (let elapsed = 1; elapsed <= leadInSec; elapsed += 1) {
      session.timers.push(setTimeout(() => setPrepLeft(leadInSec - elapsed), elapsed * 1000));
    }

    // Auto-stop one bar after the melody ends.
    const recordMs = (melodyLengthEighths(melody) + 2 * BEATS_PER_BAR) * eighthMs(bpm);
    const untilDownbeatMs = Math.max(0, (downbeatSec - ctx.currentTime) * 1000);
    session.timers.push(setTimeout(() => stop(bpm, 'complete'), untilDownbeatMs + recordMs));
    setPhase('recording');
  };

  const resetFeedback = () => {
    setFeedbackStep('ask');
    setMisjudged([]);
    setComment('');
  };

  const changeSong = () => {
    setRecording(null);
    setSelected(null);
    setPhase('idle');
  };

  // Stop the microphone and the metronome when the screen goes away.
  useEffect(
    () => () => {
      teardown();
    },
    [],
  );

  const resultView = phase === 'done' && result !== null && recording !== null;

  // Telemetry: send what is still queued, and again whenever the connection returns.
  useEffect(() => {
    const stopAutoFlush = startAutoFlush();
    if (isTelemetryEnabled()) void flush();
    return stopAutoFlush;
  }, []);

  // One record per finished attempt, built from the grading shown when the
  // result first appears. Never awaited by the UI; failures stay silent.
  useEffect(() => {
    if (phase !== 'done' || recording === null || graded === null) return;
    if (seenAttemptsRef.current.has(recording.attemptId)) return;
    seenAttemptsRef.current.add(recording.attemptId);
    if (!telemetryOn) return;
    const { attemptId } = recording;
    const input = {
      now: Date.now(),
      settings: { melodyId: melody.id, instrument, bpm: recording.bpm, prepSec, ignoreOctave, visualOnly, autoLatency },
      recording,
      graded,
      latencyMs,
      ended: recording.ended,
      env: readTelemetryEnv(),
    };
    getOrCreateDeviceId()
      .then((deviceId) => {
        if (!isTelemetryEnabled()) return;
        enqueue({ kind: 'attempt', attemptId, body: buildAttemptRecord({ ...input, deviceId }) });
        setSent({ attemptId, deviceId, autoLatency: input.settings.autoLatency });
        void flush();
      })
      .catch(() => undefined);
  }, [phase, recording, graded, telemetryOn, melody, instrument, prepSec, ignoreOctave, visualOnly, autoLatency, latencyMs]);

  const showFeedback = resultView && telemetryOn && sent !== null && sent.attemptId === recording.attemptId;

  const toggleMisjudged = (nr: number) =>
    setMisjudged((marked) => (marked.includes(nr) ? marked.filter((n) => n !== nr) : [...marked, nr]));

  const sendFeedback = (agrees: boolean) => {
    if (sent === null || !isTelemetryEnabled()) return;
    const trimmed = agrees ? '' : comment.trim().slice(0, MAX_COMMENT);
    enqueue({
      kind: 'feedback',
      attemptId: sent.attemptId,
      body: {
        v: 1,
        deviceId: sent.deviceId,
        agrees,
        misjudged: agrees
          ? []
          : rows
              .filter((row) => misjudged.includes(row.nr))
              .map((row) => ({ refIndex: row.refIndex, playedIndex: row.playedIndex })),
        ...(trimmed ? { comment: trimmed } : {}),
        regraded: autoLatency !== sent.autoLatency,
      },
    });
    setFeedbackStep('sent');
    void flush();
  };

  const changeTelemetry = (on: boolean) => {
    setTelemetryEnabled(on);
    setTelemetryOn(on);
    // Switching off drops the queued record, so no feedback can follow it.
    if (!on) setSent(null);
  };

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

      {resultView ? (
        <>
          <section aria-label={copy.SCORE_HEADING} className="flex flex-col gap-2">
            <h2 className="font-semibold">{copy.SCORE_HEADING}</h2>
            <p className="text-4xl font-bold">{copy.scoreLabel(result.scorePercent)}</p>
            <p className="text-lg">{copy.summaryText(summarize(result))}</p>
            <p className="text-xs text-slate-600">{copy.pitchLabel(result.pitchPercent)}</p>
            <ul className="grid grid-cols-2 gap-x-3 text-sm">
              {copy.LEGEND.map(([grade, text]) => (
                <li key={grade} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: gradeColour(grade) }}
                  />
                  {text}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={copy.STAFF_HEADING}>
            <h2 className="font-semibold">{copy.STAFF_HEADING}</h2>
            <Staff bars={bars} onSelect={setSelected} />
          </section>

          <section aria-label={copy.NOTES_TABLE_HEADING}>
            <h2 className="font-semibold">{copy.NOTES_TABLE_HEADING}</h2>
            <p className="text-xs text-slate-600">{copy.NOTES_TABLE_HINT}</p>
            <NotesTable
              rows={rows}
              selected={selected}
              misjudging={
                showFeedback && feedbackStep === 'no' ? { marked: misjudged, onToggle: toggleMisjudged } : undefined
              }
            />
          </section>

          {showFeedback && (
            <section aria-label={copy.FEEDBACK_HEADING} className="flex flex-col gap-2 rounded border p-3">
              <h2 className="font-semibold">{copy.FEEDBACK_HEADING}</h2>
              {feedbackStep === 'sent' ? (
                <p role="status">{copy.FEEDBACK_THANKS}</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-4 py-2 font-bold"
                      onClick={() => sendFeedback(true)}
                    >
                      {copy.FEEDBACK_YES}
                    </button>
                    <button
                      type="button"
                      aria-pressed={feedbackStep === 'no'}
                      className={`rounded border px-4 py-2 font-bold ${feedbackStep === 'no' ? 'bg-slate-200' : ''}`}
                      onClick={() => setFeedbackStep('no')}
                    >
                      {copy.FEEDBACK_NO}
                    </button>
                  </div>
                  {feedbackStep === 'no' && (
                    <>
                      <p className="text-xs text-slate-600">{copy.FEEDBACK_HINT}</p>
                      <label className="flex flex-col gap-1 text-sm">
                        <span>{copy.FEEDBACK_COMMENT_LABEL}</span>
                        <textarea
                          className="rounded border px-2 py-1"
                          rows={3}
                          maxLength={MAX_COMMENT}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="self-start rounded bg-blue-900 px-4 py-2 font-bold text-white"
                        onClick={() => sendFeedback(false)}
                      >
                        {copy.FEEDBACK_SEND}
                      </button>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded bg-blue-900 px-4 py-3 font-bold text-white"
              onClick={() => void start()}
            >
              {copy.PLAY_AGAIN_BUTTON}
            </button>
            <button type="button" className="rounded border px-4 py-3 font-bold" onClick={changeSong}>
              {copy.CHANGE_SONG_BUTTON}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">{copy.INTRO}</p>

          <section className="flex flex-col gap-3">
            {!busy && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold">{copy.MELODY_LABEL}</span>
                  <select
                    className="rounded border px-2 py-2"
                    value={melodyId}
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

                <label className="flex flex-col gap-1">
                  <span className="font-semibold">{copy.PREP_LABEL}</span>
                  <select
                    className="rounded border px-2 py-2"
                    value={prepSec}
                    onChange={(e) => setPrepSec(Number(e.target.value))}
                  >
                    {PREP_OPTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        {copy.prepOption(sec)}
                      </option>
                    ))}
                  </select>
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
                    onChange={(e) => setVisualOnly(e.target.checked)}
                  />
                  {copy.VISUAL_METRONOME_LABEL}
                </label>
              </>
            )}

            {phase === 'starting' && <p>{copy.STARTING}</p>}
            {phase === 'recording' && <Cue prepLeft={prepLeft} beat={beat} />}

            {busy ? (
              <button
                type="button"
                className="rounded bg-red-700 px-4 py-3 font-bold text-white"
                onClick={() => stop(bpm, 'stopped')}
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
            <Staff bars={bars} />
          </section>
        </>
      )}

      <section aria-label={copy.DIAGNOSTICS_HEADING} className="flex flex-col gap-2">
        <h2 className="font-semibold">{copy.DIAGNOSTICS_HEADING}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoLatency}
            onChange={(e) => setAutoLatency(e.target.checked)}
          />
          {copy.AUTO_LATENCY_LABEL}
        </label>
        {phase === 'idle' ? (
          <p className="text-sm text-slate-600">{copy.DIAGNOSTICS_EMPTY}</p>
        ) : (
          <DiagnosticsPanel
            live={live}
            instrument={instrument}
            events={recording?.events ?? null}
            latencyMs={latencyMs}
            timing={graded}
          />
        )}
      </section>

      <section className="flex flex-col gap-1 text-sm text-slate-600">
        <p>{copy.TELEMETRY_NOTICE}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={telemetryOn} onChange={(e) => changeTelemetry(e.target.checked)} />
          {copy.TELEMETRY_SWITCH_LABEL}
        </label>
      </section>
    </main>
    </div>
  );
}

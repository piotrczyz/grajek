// Diagnostics for the team: the live detector reading and the raw note events
// of the last recording (written pitch, timing, octave/twelfth suspicion), and,
// on request, the automatic recognition estimate (for the team, never shown in
// the child's result view).
import { useState } from 'react';
import * as copy from './copy.ts';
import {
  hzToNote,
  midiToName,
  soundingToWritten,
  type Instrument,
  type NoteEvent,
  type PitchFrame,
} from './logic/index.ts';
import type { NoteRow } from './results.ts';
import type { AttemptDetails } from './telemetry/record.ts';

/** The estimate of the shown grading with the note rows it is aligned with. */
export type EstimateView = AttemptDetails & { rows: NoteRow[] };

interface DiagnosticsPanelProps {
  live: PitchFrame | null;
  instrument: Instrument;
  events: NoteEvent[] | null;
  latencyMs: number | null;
  /** Onset offsets of the graded recording, before correction; null before a result. */
  timing: { meanMs: number | null; medianMs: number | null; correctionMs: number; samples: number } | null;
  /** Automatic recognition estimate; null before a result. */
  estimate?: EstimateView | null;
}

const dash = '–';

const ratio = (n: number | null) => (n === null ? dash : copy.percent(n));

/** The automatic recognition estimate, collapsed until a team member opens it. */
function RecognitionEstimatePanel({ view }: { view: EstimateView }) {
  const [open, setOpen] = useState(false);
  const { estimate, rows } = view;
  const signals: Array<[string, string]> = [
    [copy.SIGNAL_UNVOICED, ratio(estimate.signals.unvoicedRatio)],
    [copy.SIGNAL_CLARITY, estimate.signals.medianClarity === null ? dash : estimate.signals.medianClarity.toFixed(2)],
    [
      copy.SIGNAL_LATENCY_SPREAD,
      estimate.signals.latencySpreadMs === null ? dash : `${Math.round(estimate.signals.latencySpreadMs)} ms`,
    ],
    [
      copy.SIGNAL_EVENTS_PER_NOTE,
      estimate.signals.eventsPerNote === null ? dash : estimate.signals.eventsPerNote.toFixed(2),
    ],
    [copy.SIGNAL_STOPPED, estimate.signals.stopped ? copy.YES : copy.NO],
  ];
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="rounded border px-3 py-1 text-sm"
        onClick={() => setOpen(!open)}
      >
        {open ? copy.ESTIMATE_HIDE : copy.ESTIMATE_SHOW}
      </button>
      {open && (
        <section aria-label={copy.ESTIMATE_HEADING} className="mt-2 flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{copy.ESTIMATE_HEADING}</h3>
          <dl className="grid grid-cols-2 gap-x-4 font-mono text-xs">
            <dt className="text-slate-600">{copy.ESTIMATE_ACCURACY}</dt>
            <dd>{ratio(estimate.estimatedAccuracy)}</dd>
            <dt className="text-slate-600">{copy.ESTIMATE_VERSION}</dt>
            <dd>{estimate.heuristicVersion}</dd>
          </dl>
          <h4 className="text-xs font-semibold">{copy.SIGNALS_HEADING}</h4>
          <dl className="grid grid-cols-2 gap-x-4 font-mono text-xs">
            {signals.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-600">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h4 className="text-xs font-semibold">{copy.ESTIMATE_NOTES_HEADING}</h4>
          <table className="w-full table-auto text-xs">
            <thead>
              <tr className="text-left text-slate-600">
                {copy.ESTIMATE_NOTE_COLUMNS.map((column) => (
                  <th key={column} className="px-1">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estimate.notes.map((verdict, i) => (
                <tr key={i} className="border-t align-top [&>td]:px-1 [&>td]:break-words">
                  <td>{rows[i]?.nr ?? i + 1}</td>
                  <td>{rows[i]?.expected ?? dash}</td>
                  <td>{rows[i]?.played ?? dash}</td>
                  <td>{copy.VERDICT_NAMES[verdict.verdict] ?? verdict.verdict}</td>
                  <td>{verdict.reasons.map(copy.reasonName).join(', ') || dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function LiveReading({ live, instrument }: { live: PitchFrame | null; instrument: Instrument }) {
  const note = live?.hz ? hzToNote(live.hz) : null;
  const rows: Array<[string, string]> = [
    [copy.LIVE_HZ, live?.hz ? `${live.hz.toFixed(1)} Hz` : dash],
    [copy.LIVE_SOUNDING, note ? note.name : dash],
    [copy.LIVE_WRITTEN, note ? midiToName(soundingToWritten(note.midi, instrument)) : dash],
    [copy.LIVE_CENTS, note ? `${note.cents > 0 ? '+' : ''}${note.cents}` : dash],
    [copy.LIVE_LEVEL, live ? `${live.levelDb.toFixed(0)} dB` : dash],
    [copy.LIVE_CLARITY, live ? live.clarity.toFixed(2) : dash],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 font-mono text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-600">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const offset = (ms: number | null) => (ms === null ? dash : copy.signedMs(ms));

export function DiagnosticsPanel({ live, instrument, events, latencyMs, timing, estimate }: DiagnosticsPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{copy.LIVE_HEADING}</h3>
        <LiveReading live={live} instrument={instrument} />
        {latencyMs !== null && (
          <p className="font-mono text-xs text-slate-600">
            {copy.LATENCY}: {latencyMs.toFixed(0)} ms
          </p>
        )}
        {timing !== null && (
          <dl className="mt-1 grid grid-cols-2 gap-x-4 font-mono text-xs">
            <dt className="text-slate-600">{copy.MEAN_OFFSET}</dt>
            <dd>
              {offset(timing.meanMs)} {copy.offsetSamples(timing.samples)}
            </dd>
            <dt className="text-slate-600">{copy.MEDIAN_OFFSET}</dt>
            <dd>{offset(timing.medianMs)}</dd>
            <dt className="text-slate-600">{copy.APPLIED_CORRECTION}</dt>
            <dd>{offset(timing.correctionMs)}</dd>
          </dl>
        )}
      </div>
      {events !== null && (
        <div>
          <h3 className="text-sm font-semibold">{copy.EVENTS_HEADING}</h3>
          {events.length === 0 ? (
            <p className="text-sm">{copy.EVENTS_EMPTY}</p>
          ) : (
            <table className="w-full font-mono text-xs">
              <thead>
                <tr>
                  {copy.EVENT_COLUMNS.map((column) => (
                    <th key={column} className="text-left">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={i}>
                    <td>
                      {midiToName(soundingToWritten(event.midi, instrument))}
                      {event.meanCents !== 0 && ` (${event.meanCents > 0 ? '+' : ''}${event.meanCents})`}
                    </td>
                    <td>{Math.round(event.startMs)}</td>
                    <td>{Math.round(event.durationMs)}</td>
                    <td>{event.suspectOctave || ''}</td>
                    <td>{event.suspectTwelfth || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {estimate && <RecognitionEstimatePanel view={estimate} />}
    </div>
  );
}

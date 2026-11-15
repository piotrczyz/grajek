// Diagnostics for the team: the live detector reading and the raw note events
// of the last recording (written pitch, timing, octave/twelfth suspicion).
import * as copy from './copy.ts';
import {
  hzToNote,
  midiToName,
  soundingToWritten,
  type Instrument,
  type NoteEvent,
  type PitchFrame,
} from './logic/index.ts';

interface DiagnosticsPanelProps {
  live: PitchFrame | null;
  instrument: Instrument;
  events: NoteEvent[] | null;
  latencyMs: number | null;
}

const dash = '–';

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

export function DiagnosticsPanel({ live, instrument, events, latencyMs }: DiagnosticsPanelProps) {
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
    </div>
  );
}

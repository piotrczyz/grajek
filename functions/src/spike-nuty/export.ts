/**
 * CSV form of the stored spike attempts (`GET /api/spike-nuty/export?format=csv`):
 * one row per attempt, scalar columns plus `notes`, `events` and the
 * estimate's reason counts as JSON strings. The estimate columns come from
 * `resolveEstimate` (stored when current, else recomputed). RFC 4180 quoting
 * with CRLF line ends; text cells that a spreadsheet would run as a formula
 * are prefixed with `'`.
 */
import { deviceClass, resolveEstimate, type AttemptDoc, type ResolvedEstimate } from './stats.js';

type Cell = string | number | boolean | null | undefined;

const COLUMNS: Array<[string, (doc: AttemptDoc, resolved: ResolvedEstimate) => Cell]> = [
  ['id', (d) => d.id],
  ['receivedAt', (d) => d.receivedAt.toISOString()],
  ['deviceId', (d) => d.deviceId],
  ['build', (d) => d.app.build],
  ['deviceClass', (d) => deviceClass(d.device.userAgent)],
  ['standalone', (d) => d.device.standalone],
  ['platform', (d) => d.device.platform],
  ['mobile', (d) => d.device.mobile],
  ['melodyId', (d) => d.settings.melodyId],
  ['instrument', (d) => d.settings.instrument],
  ['bpm', (d) => d.settings.bpm],
  ['prepSec', (d) => d.settings.prepSec],
  ['ignoreOctave', (d) => d.settings.ignoreOctave],
  ['visualOnly', (d) => d.settings.visualOnly],
  ['autoLatency', (d) => d.settings.autoLatency],
  ['scorePercent', (d) => d.result.scorePercent],
  ['pitchPercent', (d) => d.result.pitchPercent],
  ['total', (d) => d.result.counts.total],
  ['good', (d) => d.result.counts.good],
  ['late', (d) => d.result.counts.late],
  ['early', (d) => d.result.counts.early],
  ['rhythm', (d) => d.result.counts.rhythm],
  ['wrongPitch', (d) => d.result.counts.wrongPitch],
  ['missing', (d) => d.result.counts.missing],
  ['extra', (d) => d.result.counts.extra],
  ['outputLatencyMs', (d) => d.timing.outputLatencyMs],
  ['medianOffsetMs', (d) => d.timing.medianOffsetMs],
  ['meanOffsetMs', (d) => d.timing.meanOffsetMs],
  ['correctionMs', (d) => d.timing.correctionMs],
  ['samples', (d) => d.timing.samples],
  ['ended', (d) => d.ended],
  ['heuristicVersion', (_d, r) => r.estimate.heuristicVersion],
  ['estimatedAccuracy', (_d, r) => r.estimate.estimatedAccuracy],
  ['estimateSource', (_d, r) => r.source],
  ['estimateReasons', (_d, r) => JSON.stringify(r.estimate.reasons)],
  ['notes', (d) => JSON.stringify(d.notes)],
  ['events', (d) => JSON.stringify(d.events)],
];

export const CSV_COLUMNS = COLUMNS.map(([name]) => name);

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field: text that starts like a formula gets `'`; quoted when needed. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(docs: AttemptDoc[]): string {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const doc of docs) {
    const resolved = resolveEstimate(doc);
    lines.push(COLUMNS.map(([, get]) => csvCell(get(doc, resolved))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

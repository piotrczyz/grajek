/**
 * Pure core of `functions/scripts/recompute-estimates.mjs`: parse its
 * arguments (with the safety rules that keep it off production by accident)
 * and work out which stored attempts get a new `estimate`.
 *
 * Safety: the script runs only against the Firestore emulator
 * (`FIRESTORE_EMULATOR_HOST` set) or against a project named explicitly with
 * `--project <id>`; it is a dry run unless `--write` is given, and a write
 * updates the `estimate` field only.
 */
import { estimateRecognition, HEURISTIC_VERSION, type RecognitionEstimate } from './recognition-estimate.js';
import type { StoredAttempt } from './types.js';

export const RECOMPUTE_BATCH_SIZE = 400;

export interface RecomputeOptions {
  help: boolean;
  write: boolean;
  /** `emulator` when `FIRESTORE_EMULATOR_HOST` is set (it wins over `--project`), else `project`. */
  target: 'emulator' | 'project';
  projectId: string;
  /** Inclusive UTC days on `receivedAt`; `null` = unbounded. */
  from: Date | null;
  /** Exclusive end: the day after `--to`. */
  to: Date | null;
}

export type ParsedArgs = { ok: true; options: RecomputeOptions } | { ok: false; error: string };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMULATOR_PROJECT = 'demo-grajek';

function parseDay(value: string): Date | null {
  const match = DAY.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function parseRecomputeArgs(argv: readonly string[], env: Record<string, string | undefined>): ParsedArgs {
  let help = false;
  let write = false;
  let project: string | null = null;
  let from: Date | null = null;
  let to: Date | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--write') {
      write = true;
    } else if (arg === '--project' || arg === '--from' || arg === '--to') {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined || value.startsWith('--') || value === '') {
        return { ok: false, error: `${arg} needs a value` };
      }
      if (arg === '--project') {
        project = value;
      } else {
        const day = parseDay(value);
        if (!day) {
          return { ok: false, error: `${arg} must be a day YYYY-MM-DD` };
        }
        if (arg === '--from') {
          from = day;
        } else {
          to = new Date(day.getTime() + DAY_MS);
        }
      }
    } else {
      return { ok: false, error: `unknown argument: ${arg}` };
    }
  }

  const base = { help, write, from, to };
  if (help) {
    return { ok: true, options: { ...base, target: 'emulator', projectId: project ?? EMULATOR_PROJECT } };
  }
  if (from && to && from.getTime() >= to.getTime()) {
    return { ok: false, error: '--from must not be after --to' };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    return {
      ok: true,
      options: { ...base, target: 'emulator', projectId: project ?? env.GCLOUD_PROJECT ?? EMULATOR_PROJECT },
    };
  }
  if (project === null) {
    return {
      ok: false,
      error: 'no target: set FIRESTORE_EMULATOR_HOST for the emulator, or pass --project <id> for a real project',
    };
  }
  return { ok: true, options: { ...base, target: 'project', projectId: project } };
}

export interface RecomputeUpdate {
  id: string;
  estimate: RecognitionEstimate;
}

export interface RecomputePlan {
  total: number;
  /** Stored estimate equal to the recomputed one. */
  current: number;
  /** Stored estimate missing, of another heuristic version, or different. */
  changed: number;
  /** Of `changed`, those without any stored estimate. */
  missing: number;
  /** Of `changed`, those with a stored estimate of another heuristic version. */
  otherVersion: number;
  updates: RecomputeUpdate[];
  /** New − stored estimated accuracy of the changed attempts that have both. */
  accuracyDeltas: number[];
}

/** Key-order independent JSON form, to compare a stored estimate with a fresh one. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function planRecompute(docs: ReadonlyArray<{ id: string; data: StoredAttempt }>): RecomputePlan {
  const plan: RecomputePlan = {
    total: docs.length,
    current: 0,
    changed: 0,
    missing: 0,
    otherVersion: 0,
    updates: [],
    accuracyDeltas: [],
  };
  for (const { id, data } of docs) {
    const fresh = estimateRecognition({ notes: data.notes, events: data.events, signal: data.signal, ended: data.ended });
    const stored = data.estimate;
    if (stored && canonical(stored) === canonical(fresh)) {
      plan.current += 1;
      continue;
    }
    plan.changed += 1;
    if (!stored) {
      plan.missing += 1;
    } else if (stored.heuristicVersion !== HEURISTIC_VERSION) {
      plan.otherVersion += 1;
    }
    if (stored && typeof stored.estimatedAccuracy === 'number' && fresh.estimatedAccuracy !== null) {
      plan.accuracyDeltas.push(Math.round((fresh.estimatedAccuracy - stored.estimatedAccuracy) * 1000) / 1000);
    }
    plan.updates.push({ id, estimate: fresh });
  }
  return plan;
}

/** Splits the updates into Firestore write batches. */
export function toBatches<T>(items: readonly T[], size = RECOMPUTE_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** One-line summary of the plan for the script's output. */
export function summarize(plan: RecomputePlan): Record<string, number | null> {
  const deltas = plan.accuracyDeltas;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    total: plan.total,
    alreadyCurrent: plan.current,
    wouldChange: plan.changed,
    missingEstimate: plan.missing,
    otherHeuristicVersion: plan.otherVersion,
    accuracyDeltas: deltas.length,
    meanAccuracyDelta: deltas.length === 0 ? null : round(deltas.reduce((s, d) => s + d, 0) / deltas.length),
    minAccuracyDelta: deltas.length === 0 ? null : Math.min(...deltas),
    maxAccuracyDelta: deltas.length === 0 ? null : Math.max(...deltas),
  };
}

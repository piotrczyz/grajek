/**
 * Owner-only read routes of the spike telemetry:
 * `GET /spike-nuty/stats` (aggregates) and `GET /spike-nuty/export`
 * (JSON or CSV), each with `?from=YYYY-MM-DD&to=YYYY-MM-DD` on `receivedAt`.
 * Guarded by the `X-Admin-Key` header, compared in constant time with the
 * secret `SPIKE_NUTY_ADMIN_KEY`.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { error, header, type HttpRequest, type HttpResponse } from '../http.js';
import { toCsv } from './export.js';
import type { SpikeNutyRepository } from './repository.js';
import { computeStats } from './stats.js';

/** The request as Express hands it over: with the parsed query string. */
export interface AdminRequest extends HttpRequest {
  query?: Record<string, unknown>;
}

/** The response as Express hands it over: `send` writes the CSV text. */
export interface AdminResponse extends HttpResponse {
  send(body: string): unknown;
}

export type AdminHandler = (req: AdminRequest, res: AdminResponse) => Promise<void>;

export interface SpikeNutyAdminHandlerDeps {
  repo: Pick<SpikeNutyRepository, 'listAttempts'>;
  /** The configured secret; an empty value disables the routes (503). */
  adminKey: () => string;
  now: () => Date;
  /** Called with unexpected errors (they are answered with a 500). */
  onError?: (error: unknown) => void;
}

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
export const MAX_DOCUMENTS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const ROUTE = /^(?:\/api)?\/spike-nuty\/(stats|export)\/?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateRange {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
  /** Start of `from` (UTC). */
  start: Date;
  /** Start of the day after `to` (UTC), exclusive. */
  end: Date;
}

/** Midnight UTC of a `YYYY-MM-DD` day; `null` for anything else (including `2026-02-30`). */
export function parseDay(value: string): Date | null {
  const match = DATE.exec(value);
  if (!match) {
    return null;
  }
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.toISOString().slice(0, 10) === value ? day : null;
}

const dayString = (day: Date) => day.toISOString().slice(0, 10);

function queryString(req: AdminRequest, name: string): string | undefined | null {
  const value = req.query?.[name];
  if (value === undefined || value === '') {
    return undefined;
  }
  return typeof value === 'string' ? value : null;
}

/**
 * The range from the query: both days inclusive, default the last 30 days
 * up to today (UTC), at most 366 days; `null` when invalid.
 */
export function parseRange(fromValue: string | undefined, toValue: string | undefined, now: Date): DateRange | null {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = toValue === undefined ? today : parseDay(toValue);
  if (!to) {
    return null;
  }
  const from = fromValue === undefined ? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS) : parseDay(fromValue);
  if (!from || from > to) {
    return null;
  }
  const end = new Date(to.getTime() + DAY_MS);
  if ((end.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    return null;
  }
  return { from: dayString(from), to: dayString(to), start: from, end };
}

/** Constant-time comparison of the given key with the secret (both hashed to equal length). */
export function keyMatches(given: string, secret: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export function createSpikeNutyAdminHandler(deps: SpikeNutyAdminHandlerDeps): AdminHandler {
  const { repo, now } = deps;

  function secret(): string {
    try {
      return deps.adminKey() ?? '';
    } catch {
      return '';
    }
  }

  return async function handle(req: AdminRequest, res: AdminResponse): Promise<void> {
    res.set('Cache-Control', 'no-store');
    const match = ROUTE.exec(req.path);
    if (!match) {
      return error(res, 404, 'not_found');
    }
    if (req.method !== 'GET') {
      res.set('Allow', 'GET');
      return error(res, 405, 'method_not_allowed');
    }
    const key = secret();
    if (key === '') {
      return error(res, 503, 'not_configured');
    }
    const given = header(req, 'x-admin-key');
    if (!given || !keyMatches(given, key)) {
      return error(res, 401, 'unauthorized');
    }

    const fromValue = queryString(req, 'from');
    const toValue = queryString(req, 'to');
    if (fromValue === null || toValue === null) {
      return error(res, 400, 'invalid_range');
    }
    const range = parseRange(fromValue, toValue, now());
    if (!range) {
      return error(res, 400, 'invalid_range');
    }
    const format = match[1] === 'export' ? (queryString(req, 'format') ?? 'json') : 'json';
    if (format !== 'json' && format !== 'csv') {
      return error(res, 400, 'invalid_format');
    }

    try {
      const docs = await repo.listAttempts(range.start, range.end, MAX_DOCUMENTS);
      const truncated = docs.length >= MAX_DOCUMENTS;
      if (match[1] === 'stats') {
        res.status(200).json({ from: range.from, to: range.to, ...computeStats(docs, truncated) });
        return;
      }
      if (format === 'csv') {
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="spike-nuty-${range.from}-${range.to}.csv"`);
        res.set('X-Truncated', String(truncated));
        res.status(200);
        res.send(toCsv(docs));
        return;
      }
      res.status(200).json({ from: range.from, to: range.to, truncated, attempts: docs });
    } catch (err) {
      deps.onError?.(err);
      return error(res, 500, 'internal');
    }
  };
}

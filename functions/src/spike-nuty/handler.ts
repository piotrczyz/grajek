import { bodySize, error, isJson, noContent, type HttpRequest, type HttpResponse } from '../http.js';
import type { SpikeNutyRepository } from './repository.js';
import { MAX_ATTEMPT_BYTES, parseAttempt, parseAttemptId } from './validation.js';

export interface RateLimitOptions {
  /** Accepted attempt writes per device and window. */
  limit: number;
  windowMs: number;
}

export interface SpikeNutyHandlerDeps {
  repo: SpikeNutyRepository;
  now: () => Date;
  /** Called with unexpected errors (they are answered with a 500). */
  onError?: (error: unknown) => void;
  rateLimit?: RateLimitOptions;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 60, windowMs: 60 * 60 * 1000 };

/** `/spike-nuty/attempts/{id}`, with or without the `/api` prefix. */
const ROUTE = /^(?:\/api)?\/spike-nuty\/attempts\/([^/]+)\/?$/;

export function createSpikeNutyHandler(deps: SpikeNutyHandlerDeps) {
  const { repo, now } = deps;
  const { limit, windowMs } = deps.rateLimit ?? DEFAULT_RATE_LIMIT;

  /** `true` when the write may go ahead; otherwise the 429 is already sent. */
  async function admit(res: HttpResponse, deviceId: string, at: Date): Promise<boolean> {
    const result = await repo.hitRateLimit(deviceId, at, limit, windowMs);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSec));
      error(res, 429, 'rate_limited');
    }
    return result.allowed;
  }

  async function putAttempt(req: HttpRequest, res: HttpResponse, id: string) {
    if (bodySize(req) > MAX_ATTEMPT_BYTES) {
      return error(res, 413, 'body_too_large');
    }
    if (!isJson(req)) {
      return error(res, 415, 'unsupported_media_type');
    }
    const record = parseAttempt(req.body);
    if (!record) {
      return error(res, 400, 'invalid_attempt');
    }
    // A retry of a stored attempt succeeds without a write and without
    // counting against the limit a second time.
    if (await repo.exists(id)) {
      return noContent(res);
    }
    const at = now();
    if (!(await admit(res, record.deviceId, at))) {
      return;
    }
    await repo.createIfAbsent(id, record, at);
    return noContent(res);
  }

  return async function handle(req: HttpRequest, res: HttpResponse): Promise<void> {
    res.set('Cache-Control', 'no-store');
    const match = ROUTE.exec(req.path);
    if (!match) {
      return error(res, 404, 'not_found');
    }
    if (req.method !== 'PUT') {
      res.set('Allow', 'PUT');
      return error(res, 405, 'method_not_allowed');
    }
    const id = parseAttemptId(match[1]);
    if (!id) {
      return error(res, 400, 'invalid_attempt_id');
    }
    try {
      return await putAttempt(req, res, id);
    } catch (err) {
      deps.onError?.(err);
      return error(res, 500, 'internal');
    }
  };
}

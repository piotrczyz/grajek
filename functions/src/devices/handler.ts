import type { PushSender } from './push-sender.js';
import type { DeviceRepository } from './repository.js';
import type { PushPayload } from './types.js';
import { parseDeviceId, parseSubscription } from './validation.js';

/** The subset of the Express request the handler reads. */
export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBody?: Buffer;
}

/** The subset of the Express response the handler writes. */
export interface HttpResponse {
  status(code: number): HttpResponse;
  set(field: string, value: string): HttpResponse;
  json(body: unknown): unknown;
  end(): unknown;
}

export interface DevicesHandlerDeps {
  repo: DeviceRepository;
  sender: PushSender;
  now: () => Date;
  testCooldownMs?: number;
  /** Called with unexpected errors (they are answered with a 5xx). */
  onError?: (error: unknown) => void;
}

export const MAX_BODY_BYTES = 4096;

export const TEST_PAYLOAD: PushPayload = {
  title: 'Grajek',
  body: 'Działa! Tak będą wyglądać Twoje przypomnienia o ćwiczeniu.',
  tag: 'grajek-test',
};

/** `/devices/{id}` or `/devices/{id}/test`, with or without the `/api` prefix. */
const ROUTE = /^(?:\/api)?\/devices\/([^/]+)(\/test)?\/?$/;

function error(res: HttpResponse, status: number, code: string): void {
  res.status(status).json({ error: code });
}

function noContent(res: HttpResponse, status = 204): void {
  res.status(status).end();
}

function header(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function bodySize(req: HttpRequest): number {
  if (req.rawBody) {
    return req.rawBody.length;
  }
  const length = Number(header(req, 'content-length') ?? 0);
  return Number.isFinite(length) ? length : 0;
}

function isJson(req: HttpRequest): boolean {
  const type = header(req, 'content-type') ?? '';
  return type.split(';')[0].trim().toLowerCase() === 'application/json';
}

export function createDevicesHandler(deps: DevicesHandlerDeps) {
  const { repo, sender, now } = deps;
  const cooldownMs = deps.testCooldownMs ?? 60_000;

  async function register(req: HttpRequest, res: HttpResponse, id: string) {
    if (bodySize(req) > MAX_BODY_BYTES) {
      return error(res, 413, 'body_too_large');
    }
    if (!isJson(req)) {
      return error(res, 415, 'unsupported_media_type');
    }
    const subscription = parseSubscription(req.body);
    if (!subscription) {
      return error(res, 400, 'invalid_subscription');
    }
    await repo.upsert(id, subscription, now());
    return noContent(res);
  }

  async function unregister(res: HttpResponse, id: string) {
    await repo.delete(id);
    return noContent(res);
  }

  async function sendTest(res: HttpResponse, id: string) {
    const device = await repo.get(id);
    if (!device) {
      return error(res, 404, 'unknown_device');
    }
    const at = now();
    if (device.lastTestAt && at.getTime() - device.lastTestAt.getTime() < cooldownMs) {
      return error(res, 429, 'cooldown');
    }
    let result;
    try {
      result = await sender.send(device.subscription, TEST_PAYLOAD);
    } catch (err) {
      deps.onError?.(err);
      return error(res, 502, 'push_failed');
    }
    if (result === 'gone') {
      await repo.delete(id);
      return error(res, 410, 'subscription_gone');
    }
    await repo.markTested(id, at);
    return noContent(res, 202);
  }

  return async function handle(req: HttpRequest, res: HttpResponse): Promise<void> {
    res.set('Cache-Control', 'no-store');
    const match = ROUTE.exec(req.path);
    if (!match) {
      return error(res, 404, 'not_found');
    }
    const isTest = match[2] !== undefined;
    const allowed = isTest ? 'POST' : 'PUT, DELETE';
    if (!allowed.split(', ').includes(req.method)) {
      res.set('Allow', allowed);
      return error(res, 405, 'method_not_allowed');
    }
    const id = parseDeviceId(match[1]);
    if (!id) {
      return error(res, 400, 'invalid_device_id');
    }
    try {
      if (isTest) {
        return await sendTest(res, id);
      }
      return req.method === 'PUT' ? await register(req, res, id) : await unregister(res, id);
    } catch (err) {
      deps.onError?.(err);
      return error(res, 500, 'internal');
    }
  };
}

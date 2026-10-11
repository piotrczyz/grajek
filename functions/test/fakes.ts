import type { Firestore } from 'firebase-admin/firestore';
import type { HttpRequest, HttpResponse } from '../src/devices/handler.js';
import type { PushSender, SendResult } from '../src/devices/push-sender.js';
import type { PushPayload, PushSubscriptionRecord } from '../src/devices/types.js';

type Data = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of the Admin Firestore API the repository
 * uses. `docs` exposes exactly what would be stored, field by field.
 */
export function createFakeFirestore() {
  const docs = new Map<string, Data>();
  const key = (collection: string, id: string) => `${collection}/${id}`;

  const snapshot = (path: string) => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  };

  const ref = (collection: string, id: string) => {
    const path = key(collection, id);
    return {
      path,
      async get() {
        return snapshot(path);
      },
      async delete() {
        docs.delete(path);
      },
      async update(fields: Data) {
        const current = docs.get(path);
        if (!current) {
          throw new Error(`NOT_FOUND: ${path}`);
        }
        docs.set(path, { ...current, ...fields });
      },
    };
  };
  type Ref = ReturnType<typeof ref>;

  const db = {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        get: (r: Ref) => r.get(),
        set: (r: Ref, data: Data) => {
          docs.set(r.path, { ...data });
        },
        update: (r: Ref, fields: Data) => {
          void r.update(fields);
        },
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Firestore, docs };
}

export function createFakeSender(results: Array<SendResult | Error> = []) {
  const calls: Array<{ subscription: PushSubscriptionRecord; payload: PushPayload }> = [];
  const sender: PushSender = {
    async send(subscription, payload) {
      calls.push({ subscription, payload });
      const next = results.shift() ?? 'sent';
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  return { sender, calls };
}

export interface RecordedResponse extends HttpResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  ended: boolean;
}

export function createResponse(): RecordedResponse {
  const res: RecordedResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(field, value) {
      res.headers[field.toLowerCase()] = value;
      return res;
    },
    json(body) {
      res.body = body;
      res.ended = true;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

export function jsonRequest(method: string, path: string, body?: unknown): HttpRequest {
  const raw = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return {
    method,
    path,
    headers: raw ? { 'content-type': 'application/json', 'content-length': String(raw.length) } : {},
    body,
    rawBody: raw,
  };
}

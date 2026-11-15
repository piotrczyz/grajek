import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AttemptDoc } from './stats.js';
import type { AttemptRecord, CreateResult, RateLimitResult } from './types.js';

export const ATTEMPTS_COLLECTION = 'spikeNutyAttempts';
export const RATE_LIMITS_COLLECTION = 'spikeNutyRateLimits';
export const TTL_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SpikeNutyRepository {
  /** `true` when `spikeNutyAttempts/{id}` is already stored. */
  exists(id: string): Promise<boolean>;
  /**
   * Stores the record with `receivedAt` = now and `expireAt` = now + 180 days,
   * unless the id is already stored; an existing document is never touched.
   */
  createIfAbsent(id: string, record: AttemptRecord, now: Date): Promise<CreateResult>;
  /**
   * Counts one write of the device in a fixed window that starts with its
   * first write; refuses (and counts nothing) once `limit` writes are in.
   */
  hitRateLimit(deviceId: string, now: Date, limit: number, windowMs: number): Promise<RateLimitResult>;
  /**
   * Stored attempts with `from <= receivedAt < to`, oldest first, at most
   * `limit` of them; timestamps come back as `Date`.
   */
  listAttempts(from: Date, to: Date, limit: number): Promise<AttemptDoc[]>;
}

const DATE_FIELDS = ['receivedAt', 'expireAt'] as const;

/** A stored document as an `AttemptDoc`: Firestore timestamps become `Date`. */
export function toAttemptDoc(id: string, data: Record<string, unknown>): AttemptDoc {
  const doc: Record<string, unknown> = { ...data, id };
  for (const field of DATE_FIELDS) {
    const value = doc[field];
    if (value instanceof Timestamp) {
      doc[field] = value.toDate();
    }
  }
  return doc as unknown as AttemptDoc;
}

export function expireAtFor(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + TTL_DAYS * DAY_MS);
}

export function retryAfterSec(windowStart: Date, windowMs: number, now: Date): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
}

export function createFirestoreSpikeNutyRepository(db: Firestore): SpikeNutyRepository {
  const attempt = (id: string) => db.collection(ATTEMPTS_COLLECTION).doc(id);
  const limitDoc = (deviceId: string) => db.collection(RATE_LIMITS_COLLECTION).doc(deviceId);

  return {
    async exists(id) {
      return (await attempt(id).get()).exists;
    },

    async createIfAbsent(id, record, now) {
      const ref = attempt(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          return 'exists';
        }
        tx.set(ref, {
          ...record,
          receivedAt: Timestamp.fromDate(now),
          expireAt: Timestamp.fromDate(expireAtFor(now)),
        });
        return 'created';
      });
    },

    async hitRateLimit(deviceId, now, limit, windowMs) {
      const ref = limitDoc(deviceId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : undefined;
        const start = data?.windowStart instanceof Timestamp ? data.windowStart.toDate() : undefined;
        const count = typeof data?.count === 'number' ? data.count : 0;
        if (!start || now.getTime() >= start.getTime() + windowMs) {
          tx.set(ref, {
            windowStart: Timestamp.fromDate(now),
            count: 1,
            expireAt: Timestamp.fromDate(new Date(now.getTime() + windowMs + DAY_MS)),
          });
          return { allowed: true, retryAfterSec: 0 };
        }
        if (count >= limit) {
          return { allowed: false, retryAfterSec: retryAfterSec(start, windowMs, now) };
        }
        tx.update(ref, { count: count + 1 });
        return { allowed: true, retryAfterSec: 0 };
      });
    },

    async listAttempts(from, to, limit) {
      const snap = await db
        .collection(ATTEMPTS_COLLECTION)
        .where('receivedAt', '>=', Timestamp.fromDate(from))
        .where('receivedAt', '<', Timestamp.fromDate(to))
        .orderBy('receivedAt')
        .limit(limit)
        .get();
      return snap.docs.map((d) => toAttemptDoc(d.id, d.data()));
    },
  };
}

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
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
  };
}

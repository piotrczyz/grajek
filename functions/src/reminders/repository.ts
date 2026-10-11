import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { DEVICES_COLLECTION } from '../devices/repository.js';
import type { PushSubscriptionRecord, ReminderTimes } from '../devices/types.js';
import { isValidTimeZone, localDay, nextReminderAt } from './schedule.js';

export type ClaimResult =
  | { send: false }
  | { send: true; subscription: PushSubscriptionRecord; day: string };

export interface ReminderRepository {
  /** Ids of devices whose `nextReminderAt <= now`, oldest first, at most `limit`. */
  dueDeviceIds(now: Date, limit: number): Promise<string[]>;
  /**
   * Claims the due reminder of one device: always advances `nextReminderAt`
   * past the claimed slot, and when the reminder should go out also records
   * `lastReminderDay`, so a slot is never claimed twice.
   */
  claim(id: string, now: Date, staleMs: number): Promise<ClaimResult>;
  delete(id: string): Promise<void>;
}

/** The stored fields a claim reads. */
export interface ClaimInput {
  subscription?: PushSubscriptionRecord;
  reminder?: { timezone?: unknown; times?: unknown };
  practicedOn?: unknown;
  lastReminderDay?: unknown;
  nextReminderAt?: Date;
}

export interface ClaimDecision {
  result: ClaimResult;
  /** `undefined` = write nothing; `nextReminderAt: null` = remove the field. */
  update?: { nextReminderAt: Date | null; lastReminderDay?: string };
}

/**
 * The scheduler invariants as a pure function: `slot = nextReminderAt`,
 * `day` = its local date; the next slot is the first one strictly after
 * `max(now, slot)`; send only when not practiced that day, not yet reminded
 * that day, and the slot is at most `staleMs` old.
 */
export function decideClaim(data: ClaimInput, now: Date, staleMs: number): ClaimDecision {
  const slot = data.nextReminderAt;
  if (!slot || slot.getTime() > now.getTime()) {
    // Not due (any more): another tick or a newer reminder state moved it.
    return { result: { send: false } };
  }
  const timezone = data.reminder?.timezone;
  const times = data.reminder?.times;
  if (typeof timezone !== 'string' || !isValidTimeZone(timezone) || typeof times !== 'object' || !times) {
    return { result: { send: false }, update: { nextReminderAt: null } };
  }
  const day = localDay(slot, timezone);
  const after = new Date(Math.max(now.getTime(), slot.getTime()));
  const next = nextReminderAt(times as ReminderTimes, timezone, after);
  const send =
    data.subscription !== undefined &&
    data.practicedOn !== day &&
    data.lastReminderDay !== day &&
    now.getTime() - slot.getTime() <= staleMs;
  if (!send) {
    return { result: { send: false }, update: { nextReminderAt: next } };
  }
  return {
    result: { send: true, subscription: data.subscription as PushSubscriptionRecord, day },
    update: { nextReminderAt: next, lastReminderDay: day },
  };
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

export function createFirestoreReminderRepository(db: Firestore): ReminderRepository {
  const devices = () => db.collection(DEVICES_COLLECTION);

  return {
    async dueDeviceIds(now, limit) {
      const snap = await devices()
        .where('nextReminderAt', '<=', Timestamp.fromDate(now))
        .orderBy('nextReminderAt')
        .limit(limit)
        .get();
      return snap.docs.map((d) => d.id);
    },

    async claim(id, now, staleMs) {
      const ref = devices().doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          return { send: false } as const;
        }
        const data = snap.data() ?? {};
        const decision = decideClaim(
          {
            subscription: data.subscription as PushSubscriptionRecord | undefined,
            reminder: data.reminder as ClaimInput['reminder'],
            practicedOn: data.practicedOn,
            lastReminderDay: data.lastReminderDay,
            nextReminderAt: toDate(data.nextReminderAt),
          },
          now,
          staleMs,
        );
        if (decision.update) {
          const { nextReminderAt: next, lastReminderDay } = decision.update;
          tx.update(ref, {
            nextReminderAt: next ? Timestamp.fromDate(next) : FieldValue.delete(),
            ...(lastReminderDay ? { lastReminderDay } : {}),
          });
        }
        return decision.result;
      });
    },

    async delete(id) {
      await devices().doc(id).delete();
    },
  };
}

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { DeviceRecord, PushSubscriptionRecord, ReminderState } from './types.js';

export const DEVICES_COLLECTION = 'devices';

export interface DeviceRepository {
  /** Creates or replaces the subscription; keeps `createdAt` on update. */
  upsert(id: string, subscription: PushSubscriptionRecord, now: Date): Promise<void>;
  get(id: string): Promise<DeviceRecord | null>;
  /** Idempotent: deleting an unknown device is not an error. */
  delete(id: string): Promise<void>;
  markTested(id: string, now: Date): Promise<void>;
  /**
   * Overwrites the reminder state of an existing device; `false` (nothing
   * written) when the device is unknown. `nextAt === null` removes
   * `nextReminderAt`, so the scheduler never picks the device up.
   */
  saveReminder(id: string, state: ReminderState, nextAt: Date | null, now: Date): Promise<boolean>;
}

function toDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

export function createFirestoreRepository(db: Firestore): DeviceRepository {
  const doc = (id: string) => db.collection(DEVICES_COLLECTION).doc(id);

  return {
    async upsert(id, subscription, now) {
      const ref = doc(id);
      const at = Timestamp.fromDate(now);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
          // `update` replaces the whole `subscription` map; other fields stay.
          tx.update(ref, { subscription, updatedAt: at });
        } else {
          tx.set(ref, { subscription, createdAt: at, updatedAt: at });
        }
      });
    },

    async get(id) {
      const snap = await doc(id).get();
      if (!snap.exists) {
        return null;
      }
      const data = snap.data() ?? {};
      const record: DeviceRecord = {
        subscription: data.subscription as PushSubscriptionRecord,
        createdAt: toDate(data.createdAt) ?? new Date(0),
        updatedAt: toDate(data.updatedAt) ?? new Date(0),
      };
      const lastTestAt = toDate(data.lastTestAt);
      if (lastTestAt) {
        record.lastTestAt = lastTestAt;
      }
      return record;
    },

    async delete(id) {
      await doc(id).delete();
    },

    async markTested(id, now) {
      await doc(id).update({ lastTestAt: Timestamp.fromDate(now) });
    },

    async saveReminder(id, state, nextAt, now) {
      const ref = doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          return false;
        }
        tx.update(ref, {
          reminder: { timezone: state.timezone, times: state.times },
          practicedOn: state.practicedOn,
          nextReminderAt: nextAt ? Timestamp.fromDate(nextAt) : FieldValue.delete(),
          reminderUpdatedAt: Timestamp.fromDate(now),
        });
        return true;
      });
    },
  };
}

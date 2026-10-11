/**
 * Domain types of the anonymous device registry (ADR 0001).
 *
 * A device is known only by a random id generated on the phone and its Web
 * Push subscription. Nothing else about the user or the device is stored.
 */

/** The Web Push subscription as stored: only the fields push delivery needs. */
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** ISO weekday as a map key: `'1'` = Monday .. `'7'` = Sunday. */
export type WeekdayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';

/** Local reminder time (`HH:MM`) per ISO weekday; a missing day has no reminder. */
export type ReminderTimes = Partial<Record<WeekdayKey, string>>;

/** The reminder state a device sends (`PUT /devices/{id}/reminder`). */
export interface ReminderState {
  /** IANA time zone of the device, e.g. `Europe/Warsaw`. */
  timezone: string;
  times: ReminderTimes;
  /** Local `YYYY-MM-DD` of today when a practice was logged today, else `null`. */
  practicedOn: string | null;
}

/**
 * `devices/{deviceId}` in Firestore. These are the only fields ever written:
 * `subscription`, `createdAt`, `updatedAt`, `lastTestAt`, and for the daily
 * reminder `reminder` (`{ timezone, times }`), `practicedOn`, `nextReminderAt`,
 * `reminderUpdatedAt` and `lastReminderDay` (written by the scheduler only).
 */
export interface DeviceRecord {
  subscription: PushSubscriptionRecord;
  createdAt: Date;
  updatedAt: Date;
  lastTestAt?: Date;
  reminder?: { timezone: string; times: ReminderTimes };
  practicedOn?: string | null;
  nextReminderAt?: Date;
  reminderUpdatedAt?: Date;
  lastReminderDay?: string;
}

/** The notification payload the service worker in the PWA understands. */
export interface PushPayload {
  title: string;
  body: string;
  tag: string;
}

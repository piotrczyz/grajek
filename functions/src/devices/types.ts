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

/** `devices/{deviceId}` in Firestore. No other field is ever written. */
export interface DeviceRecord {
  subscription: PushSubscriptionRecord;
  createdAt: Date;
  updatedAt: Date;
  lastTestAt?: Date;
}

/** The notification payload the service worker in the PWA understands. */
export interface PushPayload {
  title: string;
  body: string;
  tag: string;
}

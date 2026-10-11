/**
 * Notifications on this device: support detection, enabling, disabling and the
 * test notification. The UI (and later the reminders slice) calls only this.
 */
import { deleteDevice, postTestNotification, putDevice, type SubscriptionJson } from './api.ts';
import {
  getOrCreateDeviceId,
  getRegistrationState,
  saveRegistration,
  type RegistrationRecord,
} from './device-id.ts';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'denied';
export type EnableResult = 'enabled' | 'denied' | 'dismissed' | 'error';
export type DisableResult = 'disabled' | 'error';
export type TestResult = 'sent' | 'cooldown' | 'gone' | 'error';

export { getRegistrationState };

function vapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
}

/** What this browser can do with notifications right now. */
export function pushSupport(): PushSupport {
  if (!vapidPublicKey() || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  // iOS delivers Web Push only to a PWA added to the home screen (16.4+).
  if (isIos() && !isStandalone()) {
    return 'needs-install';
  }
  if (!('PushManager' in window) || !('Notification' in window)) {
    return 'needs-install';
  }
  if (Notification.permission === 'denied') {
    return 'denied';
  }
  return 'supported';
}

/** VAPID keys are base64url; `pushManager.subscribe` wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function markUnregistered(state: RegistrationRecord): Promise<void> {
  await saveRegistration({ deviceId: state.deviceId, registered: false, updatedAt: Date.now() });
}

/**
 * Asks for permission, subscribes and registers this device. Call it straight
 * from a tap handler: iOS shows the permission prompt only for a user gesture.
 */
export async function enableNotifications(): Promise<EnableResult> {
  try {
    // First await: keeps the user gesture for the permission prompt.
    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      return 'denied';
    }
    if (permission !== 'granted') {
      return 'dismissed';
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(vapidPublicKey()),
      }));
    const json = subscription.toJSON() as SubscriptionJson;
    const deviceId = await getOrCreateDeviceId();
    const status = await putDevice(deviceId, json);
    if (status !== 204) {
      return 'error';
    }
    await saveRegistration({
      deviceId,
      registered: true,
      endpoint: json.endpoint,
      updatedAt: Date.now(),
    });
    return 'enabled';
  } catch {
    return 'error';
  }
}

/** Removes the registration on the server, then the browser subscription. */
export async function disableNotifications(): Promise<DisableResult> {
  try {
    const state = await getRegistrationState();
    if (state) {
      const status = await deleteDevice(state.deviceId);
      if (status !== 204) {
        return 'error';
      }
    }
    const subscription = await currentSubscription();
    await subscription?.unsubscribe();
    if (state) {
      await markUnregistered(state);
    }
    return 'disabled';
  } catch {
    return 'error';
  }
}

/**
 * Asks the server to send one test notification. `'gone'` means the server no
 * longer has a working subscription: local state is cleared and the user has
 * to turn notifications on again.
 */
export async function sendTestNotification(): Promise<TestResult> {
  try {
    const state = await getRegistrationState();
    if (!state?.registered) {
      return 'gone';
    }
    const status = await postTestNotification(state.deviceId);
    if (status === 202) {
      return 'sent';
    }
    if (status === 429) {
      return 'cooldown';
    }
    if (status === 410 || status === 404) {
      await markUnregistered(state);
      try {
        const subscription = await currentSubscription();
        await subscription?.unsubscribe();
      } catch {
        // Best effort: a stale browser subscription is replaced on the next enable.
      }
      return 'gone';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

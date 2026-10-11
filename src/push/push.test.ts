import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateDeviceId, getRegistrationState, saveRegistration } from './device-id.ts';
import {
  base64UrlToBytes,
  disableNotifications,
  enableNotifications,
  pushSupport,
  sendTestNotification,
} from './push.ts';

const VAPID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SUBSCRIPTION_JSON = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: null,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

interface BrowserOptions {
  userAgent?: string;
  standalone?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  notification?: boolean;
  permission?: NotificationPermission;
  requestPermission?: NotificationPermission;
  existingSubscription?: boolean;
}

function stubBrowser(options: BrowserOptions = {}) {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = { toJSON: () => SUBSCRIPTION_JSON, unsubscribe };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(options.existingSubscription ? subscription : null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const nav: Record<string, unknown> = {
    userAgent: options.userAgent ?? ANDROID_UA,
    maxTouchPoints: 5,
    standalone: options.standalone,
  };
  if (options.serviceWorker !== false) {
    nav.serviceWorker = { ready: Promise.resolve({ pushManager }) };
  }
  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(display-mode: standalone)' && options.standalone === true,
  }));
  if (options.pushManager !== false) {
    vi.stubGlobal('PushManager', class {});
  } else {
    vi.stubGlobal('PushManager', undefined);
    Reflect.deleteProperty(globalThis, 'PushManager');
  }
  const requestPermission = vi.fn().mockResolvedValue(options.requestPermission ?? 'granted');
  if (options.notification !== false) {
    vi.stubGlobal('Notification', { permission: options.permission ?? 'default', requestPermission });
  } else {
    vi.stubGlobal('Notification', undefined);
    Reflect.deleteProperty(globalThis, 'Notification');
  }
  return { pushManager, subscription, unsubscribe, requestPermission };
}

function stubFetch(...statuses: number[]) {
  const fetchMock = vi.fn(async () => new Response(null, { status: statuses.shift() ?? 500 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('pushSupport', () => {
  it('is supported on Android Chrome with a VAPID key', () => {
    stubBrowser();
    expect(pushSupport()).toBe('supported');
  });

  it('is unsupported without a VAPID key', () => {
    stubBrowser();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(pushSupport()).toBe('unsupported');
  });

  it('is unsupported without service workers', () => {
    stubBrowser({ serviceWorker: false });
    expect(pushSupport()).toBe('unsupported');
  });

  it('needs install on iOS Safari outside the home-screen app', () => {
    stubBrowser({ userAgent: IPHONE_UA, standalone: false });
    expect(pushSupport()).toBe('needs-install');
  });

  it('is supported on iOS in the installed (standalone) app', () => {
    stubBrowser({ userAgent: IPHONE_UA, standalone: true });
    expect(pushSupport()).toBe('supported');
  });

  it('needs install when PushManager is missing', () => {
    stubBrowser({ pushManager: false });
    expect(pushSupport()).toBe('needs-install');
  });

  it('needs install when Notification is missing', () => {
    stubBrowser({ notification: false });
    expect(pushSupport()).toBe('needs-install');
  });

  it('is denied when the user blocked notifications', () => {
    stubBrowser({ permission: 'denied' });
    expect(pushSupport()).toBe('denied');
  });
});

describe('enableNotifications', () => {
  it('asks permission, subscribes with the VAPID key, registers the device and stores it', async () => {
    const browser = stubBrowser();
    const fetchMock = stubFetch(204);
    await expect(enableNotifications()).resolves.toBe('enabled');

    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID),
    });
    const state = await getRegistrationState();
    expect(state).toMatchObject({ registered: true, endpoint: SUBSCRIPTION_JSON.endpoint });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/devices/${state?.deviceId}`);
    expect(init.method).toBe('PUT');
    // Only the subscription leaves the phone: no expirationTime, no other data.
    expect(JSON.parse(init.body as string)).toEqual({
      subscription: { endpoint: SUBSCRIPTION_JSON.endpoint, keys: SUBSCRIPTION_JSON.keys },
    });
  });

  it('uses VITE_PUSH_API_BASE when set', async () => {
    stubBrowser();
    vi.stubEnv('VITE_PUSH_API_BASE', 'http://127.0.0.1:5001/demo-grajek/europe-central2/api/');
    const fetchMock = stubFetch(204);
    await enableNotifications();
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:5001\/demo-grajek\/europe-central2\/api\/devices\//);
  });

  it('reuses an existing browser subscription', async () => {
    const browser = stubBrowser({ existingSubscription: true });
    stubFetch(204);
    await expect(enableNotifications()).resolves.toBe('enabled');
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('returns denied and registers nothing when permission is refused', async () => {
    const browser = stubBrowser({ requestPermission: 'denied' });
    const fetchMock = stubFetch();
    await expect(enableNotifications()).resolves.toBe('denied');
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns dismissed when the prompt is closed', async () => {
    stubBrowser({ requestPermission: 'default' });
    await expect(enableNotifications()).resolves.toBe('dismissed');
  });

  it('returns error and stays unregistered when the server rejects', async () => {
    stubBrowser();
    stubFetch(400);
    await expect(enableNotifications()).resolves.toBe('error');
    expect((await getRegistrationState())?.registered).toBe(false);
  });

  it('returns error when offline', async () => {
    stubBrowser();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(enableNotifications()).resolves.toBe('error');
  });
});

describe('disableNotifications', () => {
  it('deletes on the server, unsubscribes and marks the device unregistered', async () => {
    const browser = stubBrowser({ existingSubscription: true });
    const id = await getOrCreateDeviceId();
    await saveRegistration({ deviceId: id, registered: true, endpoint: 'e', updatedAt: 1 });
    const fetchMock = stubFetch(204);

    await expect(disableNotifications()).resolves.toBe('disabled');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/devices/${id}`);
    expect(init.method).toBe('DELETE');
    expect(browser.unsubscribe).toHaveBeenCalled();
    const state = await getRegistrationState();
    expect(state).toMatchObject({ deviceId: id, registered: false });
    expect(state?.endpoint).toBeUndefined();
  });

  it('keeps the registration when the server call fails', async () => {
    const browser = stubBrowser({ existingSubscription: true });
    const id = await getOrCreateDeviceId();
    await saveRegistration({ deviceId: id, registered: true, updatedAt: 1 });
    stubFetch(500);
    await expect(disableNotifications()).resolves.toBe('error');
    expect(browser.unsubscribe).not.toHaveBeenCalled();
    expect((await getRegistrationState())?.registered).toBe(true);
  });
});

describe('sendTestNotification', () => {
  async function registered() {
    const id = await getOrCreateDeviceId();
    await saveRegistration({ deviceId: id, registered: true, endpoint: 'e', updatedAt: 1 });
    return id;
  }

  it.each([
    [202, 'sent'],
    [429, 'cooldown'],
    [500, 'error'],
    [502, 'error'],
  ] as const)('maps status %i to %s and keeps the registration', async (status, result) => {
    stubBrowser({ existingSubscription: true });
    const id = await registered();
    const fetchMock = stubFetch(status);
    await expect(sendTestNotification()).resolves.toBe(result);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/devices/${id}/test`);
    expect(init.method).toBe('POST');
    expect((await getRegistrationState())?.registered).toBe(true);
  });

  it.each([410, 404])('maps status %i to gone and clears local state', async (status) => {
    const browser = stubBrowser({ existingSubscription: true });
    const id = await registered();
    stubFetch(status);
    await expect(sendTestNotification()).resolves.toBe('gone');
    expect(await getRegistrationState()).toMatchObject({ deviceId: id, registered: false });
    expect(browser.unsubscribe).toHaveBeenCalled();
  });

  it('returns gone without a request when the device is not registered', async () => {
    stubBrowser();
    const fetchMock = stubFetch();
    await expect(sendTestNotification()).resolves.toBe('gone');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns error when offline', async () => {
    stubBrowser();
    await registered();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(sendTestNotification()).resolves.toBe('error');
  });
});

describe('base64UrlToBytes', () => {
  it('decodes an unpadded base64url VAPID key to 65 bytes', () => {
    const bytes = base64UrlToBytes(VAPID);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

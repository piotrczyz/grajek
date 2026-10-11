import { describe, expect, it, vi } from 'vitest';
// The raw text of the plain-JS worker script, exactly as it is served.
import source from '../../public/push-sw.js?raw';

const SCOPE = 'https://grajek.web.app/';

type Listener = (event: Record<string, unknown>) => void;

/** Runs public/push-sw.js against a fake ServiceWorkerGlobalScope. */
function loadWorker(windows: Array<{ url: string; focus: () => Promise<unknown> }> = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { scope: SCOPE, showNotification },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow },
  };
  new Function('self', source)(self);

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  return { dispatch, showNotification, openWindow, listeners };
}

const data = (value: unknown) => ({
  json: () => (typeof value === 'string' ? JSON.parse(value) : value),
});

describe('push-sw.js', () => {
  it('registers push and notificationclick handlers', () => {
    const { listeners } = loadWorker();
    expect([...listeners.keys()].sort()).toEqual(['notificationclick', 'push']);
  });

  it('shows the pushed title, body and tag with the app icon', async () => {
    const worker = loadWorker();
    await worker.dispatch('push', {
      data: data({ title: 'Grajek', body: 'Czas poćwiczyć!', tag: 'grajek-test' }),
    });
    expect(worker.showNotification).toHaveBeenCalledWith('Grajek', {
      icon: `${SCOPE}pwa-192x192.png`,
      lang: 'pl',
      body: 'Czas poćwiczyć!',
      tag: 'grajek-test',
    });
  });

  it.each([
    ['no data', undefined],
    ['invalid JSON', data('{not json')],
    ['no title', data({ body: 'x' })],
  ])('falls back to the title Grajek (%s)', async (_name, payload) => {
    const worker = loadWorker();
    await worker.dispatch('push', { data: payload });
    expect(worker.showNotification.mock.calls[0][0]).toBe('Grajek');
  });

  it('on tap closes the notification and focuses an open Grajek window', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const worker = loadWorker([{ url: `${SCOPE}?x=1`, focus }]);
    const close = vi.fn();
    await worker.dispatch('notificationclick', { notification: { close } });
    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('on tap opens the app when no window is open', async () => {
    const worker = loadWorker([{ url: 'https://other.example/', focus: vi.fn() }]);
    await worker.dispatch('notificationclick', { notification: { close: vi.fn() } });
    expect(worker.openWindow).toHaveBeenCalledWith(SCOPE);
  });
});

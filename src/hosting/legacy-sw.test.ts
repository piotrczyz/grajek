import { describe, expect, it, vi } from 'vitest';
// The raw text of the legacy site's plain-JS worker, exactly as it is served.
import source from '../../hosting/legacy/sw.js?raw';

const OLD_PAGE = 'https://grajek-app.web.app/some/path?q=1';
const NEW_PAGE = 'https://grajek.web.app/some/path?q=1';

type Listener = (event: Record<string, unknown>) => void;
type FakeWindow = { url: string; navigate: ReturnType<typeof vi.fn> };

/** Runs hosting/legacy/sw.js against a fake ServiceWorkerGlobalScope. */
function loadWorker({
  cacheKeys = ['workbox-precache-v2-https://grajek-app.web.app/', 'other'],
  deleteCache = vi.fn().mockResolvedValue(true),
  windows = [{ url: OLD_PAGE, navigate: vi.fn().mockResolvedValue(undefined) }],
}: {
  cacheKeys?: string[];
  deleteCache?: ReturnType<typeof vi.fn>;
  windows?: FakeWindow[];
} = {}) {
  const listeners = new Map<string, Listener>();
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const unregister = vi.fn().mockResolvedValue(true);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting,
    caches: { keys: vi.fn().mockResolvedValue(cacheKeys), delete: deleteCache },
    registration: { unregister },
    clients: { matchAll },
  };
  new Function('self', source)(self);

  const dispatch = async (type: string) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  return { dispatch, listeners, skipWaiting, unregister, matchAll, deleteCache, windows };
}

describe('legacy sw.js', () => {
  it('registers install and activate handlers only (no fetch handler)', () => {
    const { listeners } = loadWorker();
    expect([...listeners.keys()].sort()).toEqual(['activate', 'install']);
  });

  it('skips waiting on install', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.skipWaiting).toHaveBeenCalled();
  });

  it('on activate deletes every cache, unregisters and moves each window to the new address', async () => {
    const second = { url: 'https://grajek-app.web.app/#x', navigate: vi.fn().mockResolvedValue(undefined) };
    const worker = loadWorker({
      windows: [{ url: OLD_PAGE, navigate: vi.fn().mockResolvedValue(undefined) }, second],
    });
    await worker.dispatch('activate');
    expect(worker.deleteCache.mock.calls.map((call) => call[0])).toEqual([
      'workbox-precache-v2-https://grajek-app.web.app/',
      'other',
    ]);
    expect(worker.unregister).toHaveBeenCalled();
    expect(worker.matchAll).toHaveBeenCalledWith({ type: 'window' });
    expect(worker.windows[0].navigate).toHaveBeenCalledWith(NEW_PAGE);
    expect(second.navigate).toHaveBeenCalledWith('https://grajek.web.app/#x');
  });

  it('still unregisters and navigates when a cache delete is rejected', async () => {
    const worker = loadWorker({ deleteCache: vi.fn().mockRejectedValue(new Error('boom')) });
    await worker.dispatch('activate');
    expect(worker.unregister).toHaveBeenCalled();
    expect(worker.windows[0].navigate).toHaveBeenCalledWith(NEW_PAGE);
  });

  it('still navigates when unregister fails', async () => {
    const worker = loadWorker();
    worker.unregister.mockRejectedValue(new Error('boom'));
    await worker.dispatch('activate');
    expect(worker.windows[0].navigate).toHaveBeenCalledWith(NEW_PAGE);
  });
});

import type { RegisterSWOptions } from 'virtual:pwa-register';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The plugin's virtual module only exists in a Vite build; every test injects its own registerSW.
vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));
import { holdUnsavedWork } from './unsavedWork.ts';
import {
  applyUpdate,
  isUpdatePending,
  MIN_CHECK_GAP_MS,
  registerAppUpdates,
  subscribeUpdatePending,
  UPDATE_CHECK_INTERVAL_MS,
} from './updates.ts';

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  goHidden(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  goVisible(): void {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setup({ registered = true }: { registered?: boolean } = {}) {
  const doc = new FakeDocument();
  const update = vi.fn<() => Promise<unknown>>(() => Promise.resolve(undefined));
  const reload = vi.fn();
  let options: RegisterSWOptions = {};
  let intervalCallback: (() => void) | undefined;
  let intervalMs: number | undefined;
  const clearInterval = vi.fn();
  const clock = { now: 1_000_000, online: true };

  const stop = registerAppUpdates({
    registerSW: (opts) => {
      options = opts;
    },
    document: doc as unknown as Document,
    setInterval: (callback, ms) => {
      intervalCallback = callback;
      intervalMs = ms;
      return 42;
    },
    clearInterval,
    reload,
    isOnline: () => clock.online,
    now: () => clock.now,
  });

  if (registered) {
    options.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration);
  }

  return {
    doc,
    update,
    reload,
    clock,
    clearInterval,
    stop,
    options: () => options,
    tick: () => intervalCallback?.(),
    intervalMs: () => intervalMs,
    /** Lets a pending `update()` promise settle. */
    flush: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    activateNewVersion: () => options.onNeedReload?.(),
  };
}

const releases: Array<() => void> = [];
const stops: Array<() => void> = [];

function block(): () => void {
  const release = holdUnsavedWork();
  releases.push(release);
  return release;
}

function start(opts?: { registered?: boolean }) {
  const s = setup(opts);
  stops.push(s.stop);
  return s;
}

afterEach(() => {
  releases.splice(0).forEach((release) => release());
  stops.splice(0).forEach((stop) => stop());
});

describe('registerAppUpdates: update checks', () => {
  it('registers immediately and passes its own reload hook', () => {
    const s = start();
    expect(s.options().immediate).toBe(true);
    expect(s.options().onNeedReload).toBeTypeOf('function');
  });

  it('checks for an update when the app returns to the foreground', async () => {
    const s = start();
    s.doc.goVisible();
    await s.flush();
    expect(s.update).toHaveBeenCalledTimes(1);
  });

  it('does not check when the app goes to the background', () => {
    const s = start();
    s.doc.goHidden();
    expect(s.update).not.toHaveBeenCalled();
  });

  it('throttles checks to one per MIN_CHECK_GAP_MS', async () => {
    const s = start();
    s.doc.goVisible();
    await s.flush();
    s.clock.now += MIN_CHECK_GAP_MS - 1;
    s.doc.goVisible();
    await s.flush();
    expect(s.update).toHaveBeenCalledTimes(1);

    s.clock.now += 1;
    s.doc.goVisible();
    await s.flush();
    expect(s.update).toHaveBeenCalledTimes(2);
  });

  it('never overlaps checks while one is in flight', async () => {
    const s = start();
    let finish: () => void = () => {};
    s.update.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(undefined))));
    s.doc.goVisible();
    s.clock.now += MIN_CHECK_GAP_MS * 2;
    s.doc.goVisible();
    expect(s.update).toHaveBeenCalledTimes(1);

    finish();
    await s.flush();
    s.clock.now += MIN_CHECK_GAP_MS;
    s.doc.goVisible();
    expect(s.update).toHaveBeenCalledTimes(2);
  });

  it('skips the check while offline', () => {
    const s = start();
    s.clock.online = false;
    s.doc.goVisible();
    s.tick();
    expect(s.update).not.toHaveBeenCalled();
  });

  it('checks on the interval while visible, not while hidden', async () => {
    const s = start();
    expect(s.intervalMs()).toBe(UPDATE_CHECK_INTERVAL_MS);
    s.tick();
    await s.flush();
    expect(s.update).toHaveBeenCalledTimes(1);

    s.clock.now += UPDATE_CHECK_INTERVAL_MS;
    s.doc.visibilityState = 'hidden';
    s.tick();
    expect(s.update).toHaveBeenCalledTimes(1);
  });

  it('swallows errors from update()', async () => {
    const s = start();
    s.update.mockRejectedValueOnce(new TypeError('Failed to update a ServiceWorker'));
    s.doc.goVisible();
    await s.flush();
    await s.flush();
    // Vitest fails the run on any unhandled rejection, so reaching here proves it was swallowed.

    s.clock.now += MIN_CHECK_GAP_MS;
    s.doc.goVisible();
    expect(s.update).toHaveBeenCalledTimes(2);
  });

  it('does nothing before the service worker is registered', () => {
    const s = start({ registered: false });
    s.doc.goVisible();
    expect(s.update).not.toHaveBeenCalled();
  });

  it('stop() removes the listener and the interval', () => {
    const s = setup();
    s.stop();
    s.doc.goVisible();
    expect(s.update).not.toHaveBeenCalled();
    expect(s.clearInterval).toHaveBeenCalledWith(42);
  });
});

describe('registerAppUpdates: reload gate', () => {
  it('reloads at once when a new version activates and nothing is unsaved', () => {
    const s = start();
    s.activateNewVersion();
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(isUpdatePending()).toBe(false);
  });

  it('marks the update pending instead of reloading while work is unsaved', () => {
    const s = start();
    const listener = vi.fn();
    const unsubscribe = subscribeUpdatePending(listener);
    block();
    s.activateNewVersion();
    expect(s.reload).not.toHaveBeenCalled();
    expect(isUpdatePending()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('reloads on the next foreground return once the work is saved', () => {
    const s = start();
    const release = block();
    s.activateNewVersion();

    s.doc.goVisible();
    expect(s.reload).not.toHaveBeenCalled();

    release();
    s.doc.goHidden();
    s.doc.goVisible();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('applyUpdate() reloads now', () => {
    const s = start();
    block();
    s.activateNewVersion();
    applyUpdate();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });
});

import { registerSW as realRegisterSW, type RegisterSWOptions } from 'virtual:pwa-register';
import { hasUnsavedWork } from './unsavedWork.ts';

/**
 * Update lifecycle of the installed app.
 *
 * The service worker activates a new version at once (`registerType:
 * 'autoUpdate'`), but a PWA resumed from the background (iOS standalone in
 * particular) never navigates, so the browser never asks for a new `sw.js`.
 * This module asks for it on every return to the foreground and on an
 * interval while visible and online, and it is the only reload path when a new
 * version activates: it reloads at once when nothing would be lost, otherwise
 * it marks the update as pending (the UI shows a bar) and retries on the next
 * return to the foreground.
 */

/** How often a visible, online app asks for a newer service worker. */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;
/** Minimum gap between two update checks, so rapid app switching stays cheap. */
export const MIN_CHECK_GAP_MS = 30_000;

type VisibilityDocument = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

interface UpdatableRegistration {
  update(): Promise<unknown>;
}

export interface AppUpdateDeps {
  registerSW: (options: RegisterSWOptions) => unknown;
  document: VisibilityDocument;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  reload: () => void;
  isOnline: () => boolean;
  now: () => number;
}

function defaultDeps(): AppUpdateDeps {
  return {
    registerSW: realRegisterSW,
    document,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
    reload: () => window.location.reload(),
    isOnline: () => navigator.onLine,
    now: () => Date.now(),
  };
}

let pending = false;
let reloadPage: () => void = () => window.location.reload();
const pendingListeners = new Set<() => void>();

function setPending(value: boolean): void {
  if (pending === value) return;
  pending = value;
  for (const listener of pendingListeners) listener();
}

export function isUpdatePending(): boolean {
  return pending;
}

export function subscribeUpdatePending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/** Switches to the new version now (the "Odśwież" button). */
export function applyUpdate(): void {
  reloadPage();
}

/**
 * Registers the service worker and starts the update checks. Returns a
 * function that stops them (used by tests; the app never unregisters).
 */
export function registerAppUpdates(overrides: Partial<AppUpdateDeps> = {}): () => void {
  const deps: AppUpdateDeps = { ...defaultDeps(), ...overrides };
  reloadPage = deps.reload;
  setPending(false);

  let registration: UpdatableRegistration | undefined;
  let inFlight = false;
  let lastCheck: number | undefined;
  let intervalHandle: unknown;
  let stopped = false;

  async function checkForUpdate(): Promise<void> {
    if (!registration || inFlight || !deps.isOnline()) return;
    const now = deps.now();
    if (lastCheck !== undefined && now - lastCheck < MIN_CHECK_GAP_MS) return;
    lastCheck = now;
    inFlight = true;
    try {
      await registration.update();
    } catch {
      // Offline, a 404 on sw.js, a network blip: try again on the next check.
    } finally {
      inFlight = false;
    }
  }

  function onVisibilityChange(): void {
    if (deps.document.visibilityState !== 'visible') return;
    if (pending && !hasUnsavedWork()) {
      deps.reload();
      return;
    }
    void checkForUpdate();
  }

  deps.registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      if (!reg || stopped) return;
      registration = reg;
      deps.document.addEventListener('visibilitychange', onVisibilityChange);
      intervalHandle = deps.setInterval(() => {
        if (deps.document.visibilityState === 'visible') void checkForUpdate();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onNeedReload() {
      if (hasUnsavedWork()) setPending(true);
      else deps.reload();
    },
  });

  return () => {
    stopped = true;
    deps.document.removeEventListener('visibilitychange', onVisibilityChange);
    if (intervalHandle !== undefined) deps.clearInterval(intervalHandle);
    setPending(false);
  };
}

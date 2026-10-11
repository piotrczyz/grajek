/**
 * Keeps the server's copy of the reminder state up to date. A sync sends the
 * current payload only when this device is registered and the payload differs
 * from the last one the server acknowledged; a failed send stays pending and
 * is retried on the next trigger (app start, `online`, a save).
 */
import type { PracticeStore } from '../practice/practiceStore.ts';
import { dayKey } from '../practice/week.ts';
import { createIndexedDbPracticeTimeStore, type PracticeTime, type PracticeTimeStore } from '../practice-time/index.ts';
import { createIndexedDbPracticeStore } from '../practice/practiceStore.ts';
import { getRegistrationState, type RegistrationRecord } from '../push/device-id.ts';
import { putReminder } from './api.ts';
import { buildReminderPayload, samePayload, type ReminderDays, type ReminderPayload } from './reminder.ts';
import {
  loadAckedPayload,
  loadReminderDays,
  saveAckedPayload,
  type AckedReminder,
} from './reminderStore.ts';

export type SyncResult = 'sent' | 'unchanged' | 'not-registered' | 'pending';

export interface ReminderSyncDeps {
  getRegistration: () => Promise<RegistrationRecord | null>;
  loadPracticeTime: () => Promise<PracticeTime | null>;
  practicedToday: (now: Date) => Promise<boolean>;
  loadDays: () => Promise<ReminderDays>;
  loadAcked: () => Promise<AckedReminder | null>;
  saveAcked: (ack: AckedReminder) => Promise<void>;
  put: (deviceId: string, payload: ReminderPayload) => Promise<number>;
  now: () => Date;
  timezone: () => string;
}

function defaultDeps(): ReminderSyncDeps {
  let practiceTimes: PracticeTimeStore | null = null;
  let practices: PracticeStore | null = null;
  return {
    getRegistration: getRegistrationState,
    loadPracticeTime: () => (practiceTimes ??= createIndexedDbPracticeTimeStore()).load(),
    practicedToday: async (now) => {
      const week = await (practices ??= createIndexedDbPracticeStore()).listWeek(now);
      const today = dayKey(now);
      return week.some((practice) => practice.day === today);
    },
    loadDays: loadReminderDays,
    loadAcked: loadAckedPayload,
    saveAcked: saveAckedPayload,
    put: putReminder,
    now: () => new Date(),
    timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * A sync function over `deps`. Calls made while a sync runs coalesce into at
 * most one follow-up run, so a change made mid-request is not lost.
 */
export function createReminderSync(overrides: Partial<ReminderSyncDeps> = {}): () => Promise<SyncResult> {
  let deps: ReminderSyncDeps | null = null;
  const resolve = () => (deps ??= { ...defaultDeps(), ...overrides });

  async function runOnce(): Promise<SyncResult> {
    try {
      const d = resolve();
      const registration = await d.getRegistration();
      if (!registration?.registered) return 'not-registered';
      const now = d.now();
      const [practiceTime, days, practicedToday] = await Promise.all([
        d.loadPracticeTime(),
        d.loadDays(),
        d.practicedToday(now),
      ]);
      const payload = buildReminderPayload(practiceTime, days, practicedToday, now, d.timezone());
      const acked = await d.loadAcked();
      if (
        acked &&
        acked.deviceId === registration.deviceId &&
        acked.registeredAt === registration.updatedAt &&
        samePayload(acked.payload, payload)
      ) {
        return 'unchanged';
      }
      const status = await d.put(registration.deviceId, payload);
      // Anything else (offline, 404 when the server lost the device, 5xx)
      // stays pending; the panel's own flow handles a lost registration.
      if (status !== 204) return 'pending';
      await d.saveAcked({ deviceId: registration.deviceId, registeredAt: registration.updatedAt, payload });
      return 'sent';
    } catch {
      return 'pending';
    }
  }

  let running: Promise<SyncResult> | null = null;
  let queued: Promise<SyncResult> | null = null;

  return function sync(): Promise<SyncResult> {
    if (!running) {
      running = runOnce().finally(() => {
        running = null;
      });
      return running;
    }
    if (!queued) {
      queued = running.then(() => {
        queued = null;
        return sync();
      });
    }
    return queued;
  };
}

/** The app-wide sync. Never throws. */
export const syncReminder = createReminderSync();

/** One sync now, and another each time the network comes back. Returns a cleanup. */
export function startReminderSync(sync: () => Promise<SyncResult> = syncReminder): () => void {
  const onOnline = () => {
    void sync();
  };
  window.addEventListener('online', onOnline);
  void sync();
  return () => window.removeEventListener('online', onOnline);
}

type Sync = () => Promise<unknown>;

/**
 * Wraps a practice store (`add`) or a practice-time store (`save`) so that a
 * successful save triggers a sync. Results and errors are unchanged.
 */
export function withReminderSync(store: PracticeStore, sync?: Sync): PracticeStore;
export function withReminderSync(store: PracticeTimeStore, sync?: Sync): PracticeTimeStore;
export function withReminderSync(
  store: PracticeStore | PracticeTimeStore,
  sync: Sync = syncReminder,
): PracticeStore | PracticeTimeStore {
  if ('add' in store) {
    const practices = store;
    return {
      ...practices,
      add: async (input) => {
        const saved = await practices.add(input);
        void sync();
        return saved;
      },
    };
  }
  const practiceTimes = store;
  return {
    ...practiceTimes,
    save: async (input) => {
      const saved = await practiceTimes.save(input);
      void sync();
      return saved;
    },
  };
}

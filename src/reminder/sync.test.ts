import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PracticeStore } from '../practice/practiceStore.ts';
import type { PracticeTime, PracticeTimeStore } from '../practice-time/index.ts';
import type { RegistrationRecord } from '../push/device-id.ts';
import type { ReminderDays, ReminderPayload } from './reminder.ts';
import type { AckedReminder } from './reminderStore.ts';
import { createReminderSync, startReminderSync, withReminderSync, type ReminderSyncDeps } from './sync.ts';

const DEVICE = '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b';
const PORA: PracticeTime = {
  default: { time: '17:00', place: 'W domu' },
  overrides: {},
  updatedAt: '2026-10-01T10:00:00.000Z',
};

function setup(overrides: Partial<ReminderSyncDeps> = {}) {
  const state = {
    registration: { deviceId: DEVICE, registered: true, updatedAt: 1 } as RegistrationRecord | null,
    practiceTime: PORA as PracticeTime | null,
    practiced: false,
    days: { mode: 'all' } as ReminderDays,
    acked: null as AckedReminder | null,
    statuses: [] as Array<number | Error>,
  };
  const puts: ReminderPayload[] = [];
  const deps: ReminderSyncDeps = {
    getRegistration: async () => state.registration,
    loadPracticeTime: async () => state.practiceTime,
    practicedToday: async () => state.practiced,
    loadDays: async () => state.days,
    loadAcked: async () => state.acked,
    saveAcked: async (ack) => {
      state.acked = ack;
    },
    put: vi.fn(async (_id: string, payload: ReminderPayload) => {
      puts.push(payload);
      const next = state.statuses.shift() ?? 204;
      if (next instanceof Error) throw next;
      return next;
    }),
    now: () => new Date(2026, 9, 12, 9, 0),
    timezone: () => 'Europe/Warsaw',
    ...overrides,
  };
  return { state, puts, sync: createReminderSync(deps) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncReminder', () => {
  it('sends the payload once, then reports unchanged', async () => {
    const t = setup();
    await expect(t.sync()).resolves.toBe('sent');
    expect(t.puts).toHaveLength(1);
    expect(t.puts[0].times['1']).toBe('17:00');
    await expect(t.sync()).resolves.toBe('unchanged');
    expect(t.puts).toHaveLength(1);
  });

  it('sends again when something changed (a practice today)', async () => {
    const t = setup();
    await t.sync();
    t.state.practiced = true;
    await expect(t.sync()).resolves.toBe('sent');
    expect(t.puts[1].practicedOn).toBe('2026-10-12');
  });

  it('does nothing when the device is not registered', async () => {
    const t = setup();
    t.state.registration = { deviceId: DEVICE, registered: false, updatedAt: 1 };
    await expect(t.sync()).resolves.toBe('not-registered');
    t.state.registration = null;
    await expect(t.sync()).resolves.toBe('not-registered');
    expect(t.puts).toHaveLength(0);
  });

  it('stays pending after a failure and retries on the next sync', async () => {
    const t = setup();
    t.state.statuses.push(new TypeError('Failed to fetch'), 503, 404);
    await expect(t.sync()).resolves.toBe('pending');
    await expect(t.sync()).resolves.toBe('pending');
    await expect(t.sync()).resolves.toBe('pending');
    expect(t.state.acked).toBeNull();
    await expect(t.sync()).resolves.toBe('sent');
    expect(t.puts).toHaveLength(4);
  });

  it('never throws when reading local data fails', async () => {
    const t = setup({ loadDays: async () => Promise.reject(new Error('idb closed')) });
    await expect(t.sync()).resolves.toBe('pending');
  });

  it('sends again after notifications were turned off and on (a new registration)', async () => {
    const t = setup();
    await t.sync();
    t.state.registration = { deviceId: DEVICE, registered: true, updatedAt: 2 };
    await expect(t.sync()).resolves.toBe('sent');
    expect(t.puts).toHaveLength(2);
  });

  it('coalesces concurrent calls into one request', async () => {
    const t = setup();
    const results = await Promise.all([t.sync(), t.sync(), t.sync()]);
    expect(t.puts).toHaveLength(1);
    expect(results[0]).toBe('sent');
    expect(results.slice(1)).toEqual(['unchanged', 'unchanged']);
  });
});

describe('startReminderSync', () => {
  it('syncs once at start and again on every online event, until cleaned up', async () => {
    const t = setup();
    t.state.statuses.push(new TypeError('offline'));
    const sync = vi.fn(t.sync);
    const stop = startReminderSync(sync);
    expect(sync).toHaveBeenCalledTimes(1);
    await sync.mock.results[0].value;
    expect(t.state.acked).toBeNull();

    window.dispatchEvent(new Event('online'));
    expect(sync).toHaveBeenCalledTimes(2);
    await expect(sync.mock.results[1].value).resolves.toBe('sent');

    stop();
    window.dispatchEvent(new Event('online'));
    expect(sync).toHaveBeenCalledTimes(2);
  });
});

describe('withReminderSync', () => {
  it('triggers a sync after a practice is saved and returns the saved practice', async () => {
    const practice = { id: 'p1', instrumentId: 'i1', durationMinutes: 15, day: '2026-10-12', createdAt: 'x' };
    const store: PracticeStore = {
      add: vi.fn(async () => practice),
      listWeek: vi.fn(async () => []),
      lastDuration: vi.fn(async () => null),
    };
    const sync = vi.fn(async () => 'sent');
    const wrapped = withReminderSync(store, sync);
    await expect(wrapped.add({ instrumentId: 'i1', durationMinutes: 15 })).resolves.toBe(practice);
    expect(sync).toHaveBeenCalledTimes(1);
    await wrapped.listWeek();
    expect(store.listWeek).toHaveBeenCalled();
  });

  it('keeps a store error and does not sync', async () => {
    const error = new Error('invalid');
    const store: PracticeStore = {
      add: vi.fn(async () => Promise.reject(error)),
      listWeek: vi.fn(async () => []),
      lastDuration: vi.fn(async () => null),
    };
    const sync = vi.fn(async () => 'sent');
    await expect(withReminderSync(store, sync).add({ instrumentId: '', durationMinutes: 15 })).rejects.toBe(error);
    expect(sync).not.toHaveBeenCalled();
  });

  it('triggers a sync after the practice time is saved', async () => {
    const store: PracticeTimeStore = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => PORA),
    };
    const sync = vi.fn(async () => 'sent');
    const wrapped = withReminderSync(store, sync);
    await expect(wrapped.save({ default: PORA.default, overrides: {} })).resolves.toBe(PORA);
    expect(sync).toHaveBeenCalledTimes(1);
    await expect(wrapped.load()).resolves.toBeNull();
  });
});

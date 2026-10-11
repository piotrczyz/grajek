import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRegistrationState, saveRegistration } from '../push/device-id.ts';
import {
  loadAckedPayload,
  loadReminderDays,
  saveAckedPayload,
  saveReminderDays,
} from './reminderStore.ts';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reminderStore', () => {
  it('defaults to every day and to nothing acknowledged', async () => {
    await expect(loadReminderDays()).resolves.toEqual({ mode: 'all' });
    await expect(loadAckedPayload()).resolves.toBeNull();
  });

  it('round-trips the reminder days', async () => {
    await saveReminderDays({ mode: 'chosen', weekdays: [1, 3, 5] });
    await expect(loadReminderDays()).resolves.toEqual({ mode: 'chosen', weekdays: [1, 3, 5] });
  });

  it('round-trips the acknowledged payload', async () => {
    const ack = {
      deviceId: '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b',
      registeredAt: 5,
      payload: { timezone: 'Europe/Warsaw', times: { '1': '17:00' as const }, practicedOn: null },
    };
    await saveAckedPayload(ack);
    await expect(loadAckedPayload()).resolves.toEqual(ack);
  });

  it('lives beside the registration in the device store without touching it', async () => {
    const registration = { deviceId: '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b', registered: true, updatedAt: 1 };
    await saveRegistration(registration);
    await saveReminderDays({ mode: 'chosen', weekdays: [2] });
    await expect(getRegistrationState()).resolves.toEqual(registration);
  });
});

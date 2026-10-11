import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateDeviceId, getRegistrationState, saveRegistration } from './device-id.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getOrCreateDeviceId', () => {
  it('creates a random lower-case UUID v4 on first use', async () => {
    const id = await getOrCreateDeviceId();
    expect(id).toMatch(UUID_V4);
    await expect(getRegistrationState()).resolves.toMatchObject({ deviceId: id, registered: false });
  });

  it('returns the same id on later calls (persisted in IndexedDB)', async () => {
    const first = await getOrCreateDeviceId();
    const second = await getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it('keeps the id when the registration state changes', async () => {
    const id = await getOrCreateDeviceId();
    await saveRegistration({ deviceId: id, registered: true, endpoint: 'https://x', updatedAt: 1 });
    await expect(getOrCreateDeviceId()).resolves.toBe(id);
    await expect(getRegistrationState()).resolves.toEqual({
      deviceId: id,
      registered: true,
      endpoint: 'https://x',
      updatedAt: 1,
    });
  });

  it('a fresh device has no registration state', async () => {
    await expect(getRegistrationState()).resolves.toBeNull();
  });
});

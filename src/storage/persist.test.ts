import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persist.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(storage: unknown) {
  vi.stubGlobal('navigator', { ...navigator, storage });
}

describe('requestPersistentStorage', () => {
  it('returns true when the browser grants persistence', async () => {
    stubStorage({ persist: vi.fn().mockResolvedValue(true) });
    await expect(requestPersistentStorage()).resolves.toBe(true);
  });

  it('returns false when the browser denies persistence', async () => {
    stubStorage({ persist: vi.fn().mockResolvedValue(false) });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('returns false when navigator.storage is missing', async () => {
    stubStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('returns false when the request throws', async () => {
    stubStorage({ persist: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});

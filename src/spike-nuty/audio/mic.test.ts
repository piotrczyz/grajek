import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicError, openMic } from './mic.ts';

const ctx = { createMediaStreamSource: vi.fn() } as unknown as AudioContext;

function stubMediaDevices(value: unknown) {
  vi.stubGlobal('navigator', { mediaDevices: value });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function kindOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MicError);
  return (error as MicError).kind;
}

describe('openMic', () => {
  it('maps NotAllowedError to denied', async () => {
    stubMediaDevices({
      getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
    });
    expect(await kindOf(openMic(ctx))).toBe('denied');
  });

  it('maps SecurityError to denied', async () => {
    stubMediaDevices({
      getUserMedia: () => Promise.reject(new DOMException('no', 'SecurityError')),
    });
    expect(await kindOf(openMic(ctx))).toBe('denied');
  });

  it('maps a missing navigator.mediaDevices to unavailable', async () => {
    stubMediaDevices(undefined);
    expect(await kindOf(openMic(ctx))).toBe('unavailable');
  });

  it('maps NotFoundError to unavailable and anything else to other', async () => {
    stubMediaDevices({
      getUserMedia: () => Promise.reject(new DOMException('none', 'NotFoundError')),
    });
    expect(await kindOf(openMic(ctx))).toBe('unavailable');
    stubMediaDevices({ getUserMedia: () => Promise.reject(new Error('boom')) });
    expect(await kindOf(openMic(ctx))).toBe('other');
  });

  it('asks for the microphone with voice processing off', async () => {
    const stream = { getTracks: () => [] };
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    stubMediaDevices({ getUserMedia });
    const source = { disconnect: vi.fn() };
    const okCtx = { createMediaStreamSource: vi.fn(() => source) } as unknown as AudioContext;
    const mic = await openMic(okCtx);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(mic.source).toBe(source);
  });
});

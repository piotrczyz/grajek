import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hasUnsavedWork, holdUnsavedWork, subscribe, useUnsavedWork } from './unsavedWork.ts';

describe('unsaved-work registry', () => {
  it('is empty by default', () => {
    expect(hasUnsavedWork()).toBe(false);
  });

  it('counts overlapping blockers by token', () => {
    const releaseA = holdUnsavedWork();
    const releaseB = holdUnsavedWork();
    expect(hasUnsavedWork()).toBe(true);

    releaseA();
    expect(hasUnsavedWork()).toBe(true);
    releaseA(); // releasing twice does not clear the other blocker
    expect(hasUnsavedWork()).toBe(true);

    releaseB();
    expect(hasUnsavedWork()).toBe(false);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    const release = holdUnsavedWork();
    release();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    holdUnsavedWork()();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('useUnsavedWork holds a blocker while active and releases on false and on unmount', () => {
    const { rerender, unmount } = renderHook(({ active }) => useUnsavedWork(active), {
      initialProps: { active: false },
    });
    expect(hasUnsavedWork()).toBe(false);

    rerender({ active: true });
    expect(hasUnsavedWork()).toBe(true);

    rerender({ active: false });
    expect(hasUnsavedWork()).toBe(false);

    rerender({ active: true });
    act(() => unmount());
    expect(hasUnsavedWork()).toBe(false);
  });

  it('two hooks: one going idle keeps the other blocker', () => {
    const first = renderHook(({ active }) => useUnsavedWork(active), { initialProps: { active: true } });
    const second = renderHook(({ active }) => useUnsavedWork(active), { initialProps: { active: true } });

    first.rerender({ active: false });
    expect(hasUnsavedWork()).toBe(true);

    second.rerender({ active: false });
    expect(hasUnsavedWork()).toBe(false);
    first.unmount();
    second.unmount();
  });
});

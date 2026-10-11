import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RegisterSWOptions } from 'virtual:pwa-register';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdUnsavedWork } from './unsavedWork.ts';
import { UpdateBanner } from './UpdateBanner.tsx';
import { registerAppUpdates } from './updates.ts';

let stop: () => void = () => {};
let release: () => void = () => {};

afterEach(() => {
  release();
  act(() => stop());
});

/** Registers with fakes and returns a trigger for "a new version activated". */
function setupUpdates() {
  const reload = vi.fn();
  let options: RegisterSWOptions = {};
  stop = registerAppUpdates({
    registerSW: (opts) => {
      options = opts;
    },
    document: new EventTarget() as unknown as Document,
    setInterval: () => 0,
    clearInterval: () => {},
    reload,
    isOnline: () => true,
    now: () => 0,
  });
  return { reload, activate: () => act(() => options.onNeedReload?.()) };
}

describe('UpdateBanner', () => {
  it('stays hidden while no update is pending', () => {
    setupUpdates();
    render(<UpdateBanner />);
    expect(screen.queryByText('Jest nowa wersja')).not.toBeInTheDocument();
  });

  it('appears with the copy when a new version waits for unsaved work', () => {
    const { activate, reload } = setupUpdates();
    render(<UpdateBanner />);
    release = holdUnsavedWork();
    activate();

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Jest nowa wersja');
    expect(screen.getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();
  });

  it('"Odśwież" reloads onto the new version', () => {
    const { activate, reload } = setupUpdates();
    render(<UpdateBanner />);
    release = holdUnsavedWork();
    activate();

    fireEvent.click(screen.getByRole('button', { name: 'Odśwież' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

import { useSyncExternalStore } from 'react';
import { UPDATE_AVAILABLE, UPDATE_RELOAD_BUTTON } from './copy.ts';
import { applyUpdate, isUpdatePending, subscribeUpdatePending } from './updates.ts';

/**
 * A small, non-modal bar shown while a new version waits for the student to
 * finish a form. "Odśwież" switches to it now; otherwise the app switches by
 * itself on the next return to the foreground with nothing unsaved.
 */
export function UpdateBanner() {
  const pending = useSyncExternalStore(subscribeUpdatePending, isUpdatePending);
  if (!pending) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2 text-blue-950 shadow-lg">
        <p className="text-lg font-semibold">{UPDATE_AVAILABLE}</p>
        <button
          type="button"
          onClick={applyUpdate}
          className="min-h-12 rounded-2xl bg-amber-300 px-4 text-lg font-extrabold text-blue-950"
        >
          {UPDATE_RELOAD_BUTTON}
        </button>
      </div>
    </div>
  );
}

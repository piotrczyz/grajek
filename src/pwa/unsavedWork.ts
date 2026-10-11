import { useEffect } from 'react';

/**
 * App-wide registry of "work in progress that a reload would lose": a form
 * with changed fields, an open entry panel, a save in flight. The update gate
 * (`updates.ts`) reloads onto a new version only while this registry is empty.
 *
 * Blockers are counted by token, so two forms dirty at once and one of them
 * saving never clears the other.
 */

const blockers = new Set<symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function hasUnsavedWork(): boolean {
  return blockers.size > 0;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers one blocker; the returned function releases it (idempotent). */
export function holdUnsavedWork(): () => void {
  const token = Symbol('unsaved-work');
  blockers.add(token);
  notify();
  return () => {
    if (blockers.delete(token)) notify();
  };
}

/** Holds a blocker while `active` is true; releases it on `false` and on unmount. */
export function useUnsavedWork(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    return holdUnsavedWork();
  }, [active]);
}

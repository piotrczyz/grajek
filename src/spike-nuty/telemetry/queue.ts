// Bounded FIFO queue of telemetry sends in localStorage, so attempts played
// offline are sent once the connection returns. Every storage failure is
// swallowed: telemetry must never break the spike screen.
import { putAttempt, putFeedback } from './api.ts';

export const QUEUE_KEY = 'grajek.spikeNuty.queue.v1';
export const MAX_QUEUE = 20;
/** A feedback answered 404 (attempt not stored yet) is retried this many times. */
export const MAX_FEEDBACK_TRIES = 5;

export type QueueKind = 'attempt' | 'feedback';

export interface QueueItem {
  kind: QueueKind;
  attemptId: string;
  body: unknown;
  tries: number;
}

/** Sends one item; resolves with the HTTP status, rejects on a network error. */
export type Send = (item: QueueItem) => Promise<number>;

export const sendItem: Send = (item) =>
  item.kind === 'attempt' ? putAttempt(item.attemptId, item.body) : putFeedback(item.attemptId, item.body);

function isItem(value: unknown): value is QueueItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === 'attempt' || v.kind === 'feedback') &&
    typeof v.attemptId === 'string' &&
    'body' in v &&
    typeof v.tries === 'number' &&
    Number.isFinite(v.tries)
  );
}

/** The stored queue; a corrupt value is reset to empty. */
export function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isItem)) return parsed;
  } catch {
    // Unreadable or not JSON: fall through and reset.
  }
  clearQueue();
  return [];
}

function writeQueue(items: QueueItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the items are lost, the screen keeps working.
  }
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Appends an item; beyond MAX_QUEUE the oldest items are dropped. */
export function enqueue(item: Omit<QueueItem, 'tries'> & { tries?: number }): void {
  const items = [...readQueue(), { tries: 0, ...item }];
  writeQueue(items.slice(Math.max(0, items.length - MAX_QUEUE)));
}

const sameItem = (a: QueueItem, b: QueueItem) =>
  a.kind === b.kind && a.attemptId === b.attemptId && JSON.stringify(a.body) === JSON.stringify(b.body);

/** Replaces (or removes, with `next` null) the stored copy of `item`, re-reading the queue first. */
function update(item: QueueItem, next: QueueItem | null): void {
  const items = readQueue();
  const index = items.findIndex((other) => sameItem(other, item));
  if (index === -1) return;
  if (next === null) items.splice(index, 1);
  else items[index] = next;
  writeQueue(items);
}

type Outcome = 'sent' | 'drop' | 'retry-later';

function outcomeOf(item: QueueItem, status: number): Outcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 429 || status >= 500) return 'retry-later';
  if (status === 404 && item.kind === 'feedback') {
    return item.tries + 1 >= MAX_FEEDBACK_TRIES ? 'drop' : 'retry-later';
  }
  // 400, 413, 415 and any other client error can never succeed.
  return 'drop';
}

/**
 * Most sends one flush makes. Bounds the loop even if storage silently refuses
 * to remove a sent item, which would otherwise resend it forever.
 */
const MAX_SENDS_PER_FLUSH = 2 * MAX_QUEUE;

async function flushOnce(send: Send): Promise<void> {
  for (let sends = 0; sends < MAX_SENDS_PER_FLUSH; sends += 1) {
    const item = readQueue()[0];
    if (!item) return;
    let status: number;
    try {
      status = await send(item);
    } catch {
      return; // Offline or the request failed: keep the item, try again later.
    }
    const outcome = outcomeOf(item, status);
    if (outcome === 'retry-later') {
      if (status === 404) update(item, { ...item, tries: item.tries + 1 });
      return;
    }
    update(item, null);
  }
}

let running: Promise<void> | null = null;

/**
 * Sends the queued items in FIFO order, one at a time. Only one flush runs at
 * a time: a call while one is running returns the running one. Never rejects.
 */
export function flush(send: Send = sendItem): Promise<void> {
  if (running) return running;
  running = flushOnce(send)
    .catch(() => undefined)
    .finally(() => {
      running = null;
    });
  return running;
}

/** Flushes whenever the browser comes back online; returns the unsubscribe. */
export function startAutoFlush(send: Send = sendItem): () => void {
  const onOnline = () => {
    void flush(send);
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}

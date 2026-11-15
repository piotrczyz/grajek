import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueue,
  flush,
  MAX_QUEUE,
  QUEUE_KEY,
  readQueue,
  sendItem,
  startAutoFlush,
  type QueueItem,
  type Send,
} from './queue.ts';

const attempt = (n: number) => ({ kind: 'attempt' as const, attemptId: `a${n}`, body: { n } });
/** A feedback answer as queued by an older build (the manual feedback path is gone). */
const legacyFeedback = (n: number) => ({ kind: 'feedback', attemptId: `a${n}`, body: { agrees: true, n }, tries: 0 });

/** A send that answers with the given statuses in order (a thrown Error = network failure). */
function sendWith(...answers: Array<number | Error>) {
  return vi.fn<Send>(async () => {
    const answer = answers.shift() ?? 204;
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

const ids = () => readQueue().map((item) => `${item.kind}:${item.attemptId}`);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enqueue', () => {
  it('stores items with zero tries, in order', () => {
    enqueue(attempt(1));
    enqueue(attempt(2));
    expect(readQueue()).toEqual<QueueItem[]>([
      { ...attempt(1), tries: 0 },
      { ...attempt(2), tries: 0 },
    ]);
  });

  it('silently drops legacy feedback items and keeps the attempts queued beside them', async () => {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([{ ...attempt(1), tries: 0 }, legacyFeedback(1), { ...attempt(2), tries: 0 }]),
    );
    expect(ids()).toEqual(['attempt:a1', 'attempt:a2']);
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) as string)).toEqual([
      { ...attempt(1), tries: 0 },
      { ...attempt(2), tries: 0 },
    ]);
    const send = sendWith(204, 204);
    await flush(send);
    expect(send.mock.calls.map(([item]) => `${item.kind}:${item.attemptId}`)).toEqual(['attempt:a1', 'attempt:a2']);
    expect(readQueue()).toEqual([]);
  });

  it(`keeps at most ${MAX_QUEUE} items, dropping the oldest`, () => {
    for (let i = 1; i <= MAX_QUEUE + 3; i += 1) enqueue(attempt(i));
    const queue = readQueue();
    expect(queue).toHaveLength(MAX_QUEUE);
    expect(queue[0].attemptId).toBe('a4');
    expect(queue[MAX_QUEUE - 1].attemptId).toBe(`a${MAX_QUEUE + 3}`);
  });

  it('resets corrupt storage', () => {
    localStorage.setItem(QUEUE_KEY, '{not json');
    expect(readQueue()).toEqual([]);
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ kind: 'other' }]));
    expect(readQueue()).toEqual([]);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
    enqueue(attempt(1));
    expect(ids()).toEqual(['attempt:a1']);
  });

  it('swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => enqueue(attempt(1))).not.toThrow();
    expect(readQueue()).toEqual([]);
  });
});

describe('flush', () => {
  it('sends in FIFO order and removes what was accepted (2xx)', async () => {
    enqueue(attempt(1));
    enqueue(attempt(2));
    enqueue(attempt(3));
    const send = sendWith(204, 204, 200);
    await flush(send);
    expect(send.mock.calls.map(([item]) => `${item.kind}:${item.attemptId}`)).toEqual([
      'attempt:a1',
      'attempt:a2',
      'attempt:a3',
    ]);
    expect(readQueue()).toEqual([]);
  });

  it.each([400, 404, 413, 415])('drops an item answered %i and goes on', async (status) => {
    enqueue(attempt(1));
    enqueue(attempt(2));
    const send = sendWith(status, 204);
    await flush(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(readQueue()).toEqual([]);
  });

  it.each([500, 503, 429])('keeps the item and stops on %i', async (status) => {
    enqueue(attempt(1));
    enqueue(attempt(2));
    const send = sendWith(status);
    await flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['attempt:a1', 'attempt:a2']);
  });

  it('keeps the item and stops on a network error, without rejecting', async () => {
    enqueue(attempt(1));
    const send = sendWith(new TypeError('Failed to fetch'));
    await expect(flush(send)).resolves.toBeUndefined();
    expect(ids()).toEqual(['attempt:a1']);
  });

  it('runs a single flush at a time', async () => {
    enqueue(attempt(1));
    enqueue(attempt(2));
    let release: (status: number) => void = () => undefined;
    const send = vi.fn(
      (item: QueueItem) =>
        new Promise<number>((resolve) => {
          if (item.attemptId === 'a1') release = resolve;
          else resolve(204);
        }),
    );
    const first = flush(send);
    const second = flush(send);
    expect(second).toBe(first);
    expect(send).toHaveBeenCalledTimes(1);
    release(204);
    await first;
    expect(send).toHaveBeenCalledTimes(2);
    expect(readQueue()).toEqual([]);
  });

  it('also sends items enqueued while it runs', async () => {
    enqueue(attempt(1));
    const send = vi.fn(async (item: QueueItem) => {
      if (item.attemptId === 'a1') enqueue(attempt(2));
      return 204;
    });
    await flush(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(readQueue()).toEqual([]);
  });
});

describe('startAutoFlush', () => {
  it('flushes when the browser comes back online, until stopped', async () => {
    const send = sendWith(204, 204);
    const stop = startAutoFlush(send);
    enqueue(attempt(1));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(readQueue()).toEqual([]));
    expect(send).toHaveBeenCalledTimes(1);
    stop();
    enqueue(attempt(2));
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['attempt:a2']);
  });
});

describe('sendItem', () => {
  it('PUTs attempts as JSON to the spike-nuty attempt route and returns the status', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(sendItem({ ...attempt(1), tries: 0 })).resolves.toBe(204);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/spike-nuty/attempts/a1']);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: 1 }),
    });
  });
});

describe('flush when storage refuses to remove', () => {
  it('stops instead of resending forever', async () => {
    enqueue(attempt(1));
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const send = sendWith();
    await flush(send);
    expect(send.mock.calls.length).toBeLessThanOrEqual(2 * MAX_QUEUE);
  });
});

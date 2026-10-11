import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { createDevicesHandler } from '../src/devices/handler.js';
import { createFirestoreRepository } from '../src/devices/repository.js';
import type { SendResult } from '../src/devices/push-sender.js';
import { REMINDER_MESSAGES, REMINDER_TAG, reminderPayload } from '../src/reminders/messages.js';
import {
  createFirestoreReminderRepository,
  decideClaim,
  type ClaimInput,
  type ReminderRepository,
} from '../src/reminders/repository.js';
import { runReminderTick } from '../src/reminders/tick.js';
import { createFakeFirestore, createFakeSender, createResponse, jsonRequest } from './fakes.js';

const WARSAW = 'Europe/Warsaw';
const EVERY_DAY_17 = { '1': '17:00', '2': '17:00', '3': '17:00', '4': '17:00', '5': '17:00', '6': '17:00', '7': '17:00' };
// Monday 2026-10-12, 17:00 Warsaw (CEST).
const SLOT = new Date('2026-10-12T15:00:00Z');
const minutes = (n: number) => n * 60_000;
const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

function subscription(n: number) {
  return { endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: 'p', auth: 'a' } };
}

/** In-memory reminder repository built on the same claim decision as the Firestore one. */
function createMemoryRepo() {
  const devices = new Map<string, ClaimInput>();
  const deleted: string[] = [];
  const repo: ReminderRepository = {
    async dueDeviceIds(now, limit) {
      return [...devices.entries()]
        .filter(([, d]) => d.nextReminderAt && d.nextReminderAt.getTime() <= now.getTime())
        .sort(([, a], [, b]) => (a.nextReminderAt as Date).getTime() - (b.nextReminderAt as Date).getTime())
        .slice(0, limit)
        .map(([id]) => id);
    },
    async claim(id, now, staleMs) {
      const data = devices.get(id);
      if (!data) {
        return { send: false };
      }
      const decision = decideClaim(data, now, staleMs);
      if (decision.update) {
        const { nextReminderAt, lastReminderDay } = decision.update;
        const next: ClaimInput = { ...data };
        if (nextReminderAt) {
          next.nextReminderAt = nextReminderAt;
        } else {
          delete next.nextReminderAt;
        }
        if (lastReminderDay) {
          next.lastReminderDay = lastReminderDay;
        }
        devices.set(id, next);
      }
      return decision.result;
    },
    async delete(id) {
      deleted.push(id);
      devices.delete(id);
    },
  };
  const add = (id: string, fields: Partial<ClaimInput> = {}) => {
    devices.set(id, {
      subscription: subscription(devices.size + 1),
      reminder: { timezone: WARSAW, times: EVERY_DAY_17 },
      practicedOn: null,
      nextReminderAt: SLOT,
      ...fields,
    });
  };
  return { repo, devices, deleted, add };
}

function tick(memory: ReturnType<typeof createMemoryRepo>, now: Date, results: Array<SendResult | Error> = []) {
  const push = createFakeSender(results);
  const errors: unknown[] = [];
  const run = runReminderTick({
    repo: memory.repo,
    sender: push.sender,
    now: () => now,
    onError: (e) => errors.push(e),
  });
  return run.then((result) => ({ result, calls: push.calls, errors }));
}

describe('runReminderTick', () => {
  it('sends one reminder when due and advances to the next day', async () => {
    const m = createMemoryRepo();
    m.add('a');
    const { result, calls } = await tick(m, at(SLOT, minutes(2)));
    expect(result).toEqual({ sent: 1, skipped: 0, removed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toEqual(reminderPayload('2026-10-12'));
    expect(m.devices.get('a')?.lastReminderDay).toBe('2026-10-12');
    expect(m.devices.get('a')?.nextReminderAt?.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });

  it('does nothing before the slot', async () => {
    const m = createMemoryRepo();
    m.add('a');
    const { result, calls } = await tick(m, at(SLOT, -minutes(1)));
    expect(result).toEqual({ sent: 0, skipped: 0, removed: 0 });
    expect(calls).toHaveLength(0);
  });

  it('skips and advances when a practice was logged that day', async () => {
    const m = createMemoryRepo();
    m.add('a', { practicedOn: '2026-10-12' });
    const { result, calls } = await tick(m, at(SLOT, minutes(1)));
    expect(result).toEqual({ sent: 0, skipped: 1, removed: 0 });
    expect(calls).toHaveLength(0);
    expect(m.devices.get('a')?.nextReminderAt?.toISOString()).toBe('2026-10-13T15:00:00.000Z');
    expect(m.devices.get('a')?.lastReminderDay).toBeUndefined();
  });

  it('sends when the logged practice was on an earlier day', async () => {
    const m = createMemoryRepo();
    m.add('a', { practicedOn: '2026-10-11' });
    const { result } = await tick(m, at(SLOT, minutes(1)));
    expect(result.sent).toBe(1);
  });

  it('never sends twice in one day, also after the time was moved later the same day', async () => {
    const m = createMemoryRepo();
    m.add('a');
    await tick(m, at(SLOT, minutes(1)));
    // The student moves the reminder to 18:00 today after it was sent.
    const later = new Date('2026-10-12T16:00:00Z');
    m.devices.set('a', { ...(m.devices.get('a') as ClaimInput), nextReminderAt: later });
    const { result, calls } = await tick(m, at(later, minutes(1)));
    expect(result).toEqual({ sent: 0, skipped: 1, removed: 0 });
    expect(calls).toHaveLength(0);
    expect(m.devices.get('a')?.nextReminderAt?.toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });

  it('a second tick within the same slot sends nothing', async () => {
    const m = createMemoryRepo();
    m.add('a');
    await tick(m, at(SLOT, minutes(1)));
    const { result, calls } = await tick(m, at(SLOT, minutes(6)));
    expect(result.sent).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('skips a slot older than 30 minutes and advances past now', async () => {
    const m = createMemoryRepo();
    // Slot from yesterday (scheduler was down).
    m.add('a', { nextReminderAt: new Date('2026-10-11T15:00:00Z') });
    const { result, calls } = await tick(m, at(SLOT, -minutes(60)));
    expect(result).toEqual({ sent: 0, skipped: 1, removed: 0 });
    expect(calls).toHaveLength(0);
    expect(m.devices.get('a')?.nextReminderAt?.toISOString()).toBe(SLOT.toISOString());
  });

  it('still sends a slot exactly 30 minutes old', async () => {
    const m = createMemoryRepo();
    m.add('a');
    const { result } = await tick(m, at(SLOT, minutes(30)));
    expect(result.sent).toBe(1);
  });

  it('deletes the device when the push service says the subscription is gone', async () => {
    const m = createMemoryRepo();
    m.add('a');
    const { result } = await tick(m, at(SLOT, minutes(1)), ['gone']);
    expect(result).toEqual({ sent: 0, skipped: 0, removed: 1 });
    expect(m.deleted).toEqual(['a']);
  });

  it('a send error does not stop the batch, is reported, and is not retried that day', async () => {
    const m = createMemoryRepo();
    m.add('a');
    m.add('b');
    const first = await tick(m, at(SLOT, minutes(1)), [new Error('push down')]);
    expect(first.calls).toHaveLength(2);
    expect(first.result).toEqual({ sent: 1, skipped: 0, removed: 0 });
    expect(first.errors).toHaveLength(1);
    const again = await tick(m, at(SLOT, minutes(6)));
    expect(again.calls).toHaveLength(0);
  });

  it('processes at most the batch size, oldest first', async () => {
    const m = createMemoryRepo();
    for (let i = 0; i < 5; i += 1) {
      m.add(`d${i}`, { nextReminderAt: at(SLOT, -minutes(i)) });
    }
    const push = createFakeSender();
    const result = await runReminderTick({
      repo: m.repo,
      sender: push.sender,
      now: () => at(SLOT, minutes(1)),
      batchSize: 2,
    });
    expect(result.sent).toBe(2);
    expect(push.calls.map((c) => c.subscription.endpoint)).toEqual([
      subscription(5).endpoint,
      subscription(4).endpoint,
    ]);
  });

  it('removes nextReminderAt when no later slot exists (times emptied)', async () => {
    const m = createMemoryRepo();
    m.add('a', { reminder: { timezone: WARSAW, times: {} } });
    const { result } = await tick(m, at(SLOT, minutes(1)));
    expect(result.sent).toBe(1);
    expect(m.devices.get('a')).not.toHaveProperty('nextReminderAt');
  });

  it('uses the device zone to decide the day', async () => {
    const m = createMemoryRepo();
    // 23:30 UTC Sunday = 01:30 Monday in Warsaw; practiced "Monday" means skip.
    const slot = new Date('2026-10-11T23:30:00Z');
    m.add('a', { nextReminderAt: slot, practicedOn: '2026-10-12', reminder: { timezone: WARSAW, times: { '1': '01:30' } } });
    const { result } = await tick(m, at(slot, minutes(1)));
    expect(result.skipped).toBe(1);
  });
});

describe('reminderPayload', () => {
  it('is a fixed encouraging line with the reminder tag, stable per day', () => {
    const payload = reminderPayload('2026-10-12');
    expect(payload.title).toBe('Grajek');
    expect(payload.tag).toBe(REMINDER_TAG);
    expect(REMINDER_MESSAGES).toContain(payload.body);
    expect(reminderPayload('2026-10-12')).toEqual(payload);
    const bodies = new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((d) => reminderPayload(d).body));
    expect(bodies.size).toBeGreaterThan(1);
  });

  it('carries no pressure wording', () => {
    for (const line of REMINDER_MESSAGES) {
      expect(line.toLowerCase()).not.toMatch(/przegap|zapomn|seri|musisz|ostatni/);
    }
  });
});

describe('Firestore reminder repository claim', () => {
  const ID = '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b';
  const SUBSCRIPTION = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: {
      p256dh:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  };

  async function registered(practicedOn: string | null = null) {
    const firestore = createFakeFirestore();
    const handle = createDevicesHandler({
      repo: createFirestoreRepository(firestore.db),
      sender: createFakeSender().sender,
      now: () => new Date('2026-10-12T08:00:00Z'),
    });
    await handle(jsonRequest('PUT', `/devices/${ID}`, { subscription: SUBSCRIPTION }), createResponse());
    await handle(
      jsonRequest('PUT', `/devices/${ID}/reminder`, { timezone: WARSAW, times: { '1': '17:00', '2': '17:00' }, practicedOn }),
      createResponse(),
    );
    return { repo: createFirestoreReminderRepository(firestore.db), doc: () => firestore.docs.get(`devices/${ID}`) };
  }

  it('claims once: records the day, advances nextReminderAt, returns the subscription', async () => {
    const { repo, doc } = await registered();
    const claim = await repo.claim(ID, at(SLOT, minutes(1)), minutes(30));
    expect(claim).toEqual({ send: true, subscription: SUBSCRIPTION, day: '2026-10-12' });
    expect(doc()?.lastReminderDay).toBe('2026-10-12');
    expect((doc()?.nextReminderAt as Timestamp).toDate().toISOString()).toBe('2026-10-13T15:00:00.000Z');
    expect(await repo.claim(ID, at(SLOT, minutes(2)), minutes(30))).toEqual({ send: false });
  });

  it('skips without recording the day when practiced, and still advances nextReminderAt', async () => {
    const { repo, doc } = await registered('2026-10-12');
    expect(await repo.claim(ID, at(SLOT, minutes(1)), minutes(30))).toEqual({ send: false });
    expect(doc()).not.toHaveProperty('lastReminderDay');
    expect((doc()?.nextReminderAt as Timestamp).toDate().toISOString()).toBe('2026-10-13T15:00:00.000Z');
  });

  it('answers send: false for an unknown device', async () => {
    const { repo } = await registered();
    expect(await repo.claim('9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', SLOT, minutes(30))).toEqual({ send: false });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createSpikeNutyAdminHandler,
  keyMatches,
  MAX_DOCUMENTS,
  parseDay,
  parseRange,
  type AdminRequest,
  type AdminResponse,
} from '../src/spike-nuty/admin-handler.js';
import { CSV_COLUMNS } from '../src/spike-nuty/export.js';
import { createResponse, type RecordedResponse } from './fakes.js';
import { createMemorySpikeNutyRepository, DEVICE_ID, OTHER_DEVICE_ID, sampleAttempt } from './spike-nuty-fakes.js';

const NOW = new Date('2026-11-15T10:00:00Z');
const KEY = 'test-admin-key';
const DAY_MS = 24 * 60 * 60 * 1000;

type AdminRecorded = RecordedResponse & AdminResponse & { text?: string };

function adminResponse(): AdminRecorded {
  const res = createResponse() as AdminRecorded;
  res.send = (body: string) => {
    res.text = body;
    res.ended = true;
    return res;
  };
  return res;
}

function setup(options: { adminKey?: () => string } = {}) {
  const memory = createMemorySpikeNutyRepository();
  const errors: unknown[] = [];
  const handle = createSpikeNutyAdminHandler({
    repo: memory.repo,
    adminKey: options.adminKey ?? (() => KEY),
    now: () => NOW,
    onError: (e) => errors.push(e),
  });
  const call = async (
    path: string,
    query: Record<string, unknown> = {},
    { method = 'GET', key = KEY as string | null } = {},
  ) => {
    const req: AdminRequest = { method, path, headers: key === null ? {} : { 'x-admin-key': key }, query };
    const res = adminResponse();
    await handle(req, res);
    return res;
  };
  const store = (id: string, receivedAt: Date, overrides: Record<string, unknown> = {}, extra = {}) => {
    memory.attempts.set(id, { ...sampleAttempt(overrides), receivedAt, expireAt: new Date(receivedAt.getTime() + 180 * DAY_MS), ...extra });
  };
  return { ...memory, call, store, errors };
}

describe('parseDay and parseRange', () => {
  it('accepts only real YYYY-MM-DD days', () => {
    expect(parseDay('2026-11-15')?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-1-5')).toBeNull();
    expect(parseDay('15.11.2026')).toBeNull();
  });

  it('defaults to the last 30 days up to today and caps the range at 366 days', () => {
    expect(parseRange(undefined, undefined, NOW)).toMatchObject({ from: '2026-10-16', to: '2026-11-15' });
    expect(parseRange(undefined, undefined, NOW)?.end.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(parseRange(undefined, '2026-01-31', NOW)).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
    expect(parseRange('2025-01-01', '2026-01-01', NOW)).toMatchObject({ from: '2025-01-01', to: '2026-01-01' });
    expect(parseRange('2025-01-01', '2026-01-02', NOW)).toBeNull();
    expect(parseRange('2026-11-15', '2026-11-14', NOW)).toBeNull();
    expect(parseRange('2026-11-15', '2026-11-15', NOW)).toMatchObject({ from: '2026-11-15', to: '2026-11-15' });
  });

  it('compares keys by value', () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches('wrong', KEY)).toBe(false);
    expect(keyMatches(`${KEY}x`, KEY)).toBe(false);
  });
});

describe('admin auth', () => {
  it.each(['/api/spike-nuty/stats', '/spike-nuty/export'])('answers 401 to %s without a key', async (path) => {
    const res = await setup().call(path, {}, { key: null });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 401 to a wrong key and reads nothing', async () => {
    const t = setup();
    const res = await t.call('/api/spike-nuty/stats', {}, { key: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(t.calls.listAttempts).toHaveLength(0);
  });

  it('answers 503 when the secret is empty or unavailable, whatever the key', async () => {
    expect((await setup({ adminKey: () => '' }).call('/api/spike-nuty/stats', {}, { key: '' })).statusCode).toBe(503);
    const res = await setup({
      adminKey: () => {
        throw new Error('no secret');
      },
    }).call('/api/spike-nuty/stats');
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'not_configured' });
  });

  it('answers 405 with Allow: GET to other methods', async () => {
    const res = await setup().call('/api/spike-nuty/stats', {}, { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });

  it('answers 404 to other paths', async () => {
    expect((await setup().call('/api/spike-nuty/statsx')).statusCode).toBe(404);
  });
});

describe('GET /spike-nuty/stats', () => {
  it('answers 200 with the aggregates of the range', async () => {
    const t = setup();
    t.store('a', new Date('2026-11-10T12:00:00Z'));
    t.store('b', new Date('2026-11-15T23:59:59Z'), { deviceId: OTHER_DEVICE_ID, ended: 'stopped' }, {
      feedback: { agrees: true, regraded: false, misjudged: [] },
    });
    t.store('old', new Date('2026-09-01T12:00:00Z'));
    t.store('future', new Date('2026-11-16T00:00:00Z'));

    const res = await t.call('/api/spike-nuty/stats');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      from: '2026-10-16',
      to: '2026-11-15',
      attempts: 2,
      devices: 2,
      ended: { complete: 1, stopped: 1 },
      feedback: { answered: 1, agrees: 1, agreesPercent: 100 },
      truncated: false,
    });
    const body = res.body as Record<string, unknown>;
    for (const field of ['scoreHistogram', 'topMisjudged', 'latencyByDeviceClass', 'octaveErrorRate', 'twelfthErrorRate']) {
      expect(body).toHaveProperty(field);
    }
    expect(t.calls.listAttempts).toEqual([
      { from: new Date('2026-10-16T00:00:00Z'), to: new Date('2026-11-16T00:00:00Z'), limit: MAX_DOCUMENTS },
    ]);
  });

  it.each([
    [{ from: '2026-13-01' }],
    [{ to: 'yesterday' }],
    [{ from: '2026-11-15', to: '2026-11-01' }],
    [{ from: '2024-01-01', to: '2026-01-01' }],
    [{ from: ['2026-11-01', '2026-11-02'] }],
  ])('answers 400 invalid_range to %j', async (query) => {
    const t = setup();
    const res = await t.call('/api/spike-nuty/stats', query);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_range' });
    expect(t.calls.listAttempts).toHaveLength(0);
  });

  it('answers 500 internal when the read fails', async () => {
    const t = setup();
    t.repo.listAttempts = async () => {
      throw new Error('boom');
    };
    const res = await t.call('/api/spike-nuty/stats');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'internal' });
    expect(t.errors).toHaveLength(1);
  });
});

describe('GET /spike-nuty/export', () => {
  it('answers JSON by default with the attempts of the range', async () => {
    const t = setup();
    t.store('a', new Date('2026-11-01T08:00:00Z'));
    t.store('b', new Date('2026-11-03T08:00:00Z'));
    const res = await t.call('/api/spike-nuty/export', { from: '2026-11-01', to: '2026-11-02' });
    expect(res.statusCode).toBe(200);
    const body = res.body as { from: string; to: string; truncated: boolean; attempts: Array<{ id: string; deviceId: string }> };
    expect(body).toMatchObject({ from: '2026-11-01', to: '2026-11-02', truncated: false });
    expect(body.attempts.map((a) => a.id)).toEqual(['a']);
    expect(body.attempts[0].deviceId).toBe(DEVICE_ID);
  });

  it('answers CSV as an attachment with format=csv', async () => {
    const t = setup();
    t.store('a', new Date('2026-11-01T08:00:00Z'));
    const res = await t.call('/spike-nuty/export/', { from: '2026-11-01', to: '2026-11-02', format: 'csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="spike-nuty-2026-11-01-2026-11-02.csv"');
    expect(res.headers['x-truncated']).toBe('false');
    const lines = (res.text ?? '').split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1].startsWith('a,2026-11-01T08:00:00.000Z,')).toBe(true);
  });

  it('answers 400 invalid_format to an unknown format', async () => {
    const res = await setup().call('/api/spike-nuty/export', { format: 'xml' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_format' });
  });

  it('flags truncated when the document cap is reached', async () => {
    const t = setup();
    t.repo.listAttempts = async () => [];
    const capped = setup();
    const doc = { ...sampleAttempt(), id: 'x', receivedAt: NOW, expireAt: NOW };
    capped.repo.listAttempts = async (_from, _to, limit) => Array.from({ length: limit }, () => doc as never);
    expect(((await t.call('/api/spike-nuty/export')).body as { truncated: boolean }).truncated).toBe(false);
    expect(((await capped.call('/api/spike-nuty/stats')).body as { truncated: boolean }).truncated).toBe(true);
  });
});

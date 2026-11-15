import { describe, expect, it } from 'vitest';
import { createApiHandler } from '../src/api-router.js';
import type { HttpRequest } from '../src/http.js';
import { createResponse, jsonRequest } from './fakes.js';

function setup() {
  const seen: Array<{ handler: string; path: string }> = [];
  const record = (handler: string) => async (req: HttpRequest) => {
    seen.push({ handler, path: req.path });
  };
  const handle = createApiHandler({ devices: record('devices'), spikeNuty: record('spikeNuty') });
  const route = async (path: string) => {
    seen.length = 0;
    await handle(jsonRequest('PUT', path), createResponse());
    return seen.map((s) => s.handler);
  };
  return { route };
}

describe('createApiHandler', () => {
  it.each([
    '/spike-nuty/attempts/x',
    '/api/spike-nuty/attempts/x/',
    '/spike-nuty',
    '/api/spike-nuty/',
    '/api/spike-nuty/stats',
  ])('sends %s to the spike-nuty handler', async (path) => {
    expect(await setup().route(path)).toEqual(['spikeNuty']);
  });

  it.each([
    '/devices/x',
    '/api/devices/x/test',
    '/',
    '/api/spike-nutyx/attempts/x',
    '/api/other/spike-nuty/x',
    '/unknown',
  ])('sends %s to the devices handler', async (path) => {
    expect(await setup().route(path)).toEqual(['devices']);
  });
});

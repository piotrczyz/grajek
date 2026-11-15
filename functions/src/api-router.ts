import type { HttpHandler, HttpRequest, HttpResponse } from './http.js';

export interface ApiHandlers {
  devices: HttpHandler;
  spikeNuty: HttpHandler;
}

/** Paths under `/spike-nuty/`, with or without the `/api` prefix of the Hosting rewrite. */
const SPIKE_NUTY = /^(?:\/api)?\/spike-nuty(?:\/|$)/;

/**
 * The single `api` function's entry point: `/spike-nuty/...` goes to the
 * spike telemetry handler, every other path to the devices handler unchanged.
 */
export function createApiHandler(handlers: ApiHandlers): HttpHandler {
  return (req: HttpRequest, res: HttpResponse) =>
    SPIKE_NUTY.test(req.path) ? handlers.spikeNuty(req, res) : handlers.devices(req, res);
}

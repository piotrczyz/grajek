import type { HttpHandler } from './http.js';
import type { AdminHandler, AdminRequest, AdminResponse } from './spike-nuty/admin-handler.js';

export interface ApiHandlers {
  devices: HttpHandler;
  spikeNuty: HttpHandler;
  spikeNutyAdmin: AdminHandler;
}

/** Paths under `/spike-nuty/`, with or without the `/api` prefix of the Hosting rewrite. */
const SPIKE_NUTY = /^(?:\/api)?\/spike-nuty(?:\/|$)/;
/** The owner's read routes `/spike-nuty/stats` and `/spike-nuty/export`. */
const SPIKE_NUTY_ADMIN = /^(?:\/api)?\/spike-nuty\/(?:stats|export)\/?$/;

/**
 * The single `api` function's entry point: the owner's `/spike-nuty/stats`
 * and `/spike-nuty/export` go to the admin handler, other `/spike-nuty/...`
 * paths to the spike telemetry handler, every other path to the devices
 * handler unchanged.
 */
export function createApiHandler(handlers: ApiHandlers): AdminHandler {
  return (req: AdminRequest, res: AdminResponse) => {
    if (SPIKE_NUTY_ADMIN.test(req.path)) {
      return handlers.spikeNutyAdmin(req, res);
    }
    return SPIKE_NUTY.test(req.path) ? handlers.spikeNuty(req, res) : handlers.devices(req, res);
  };
}

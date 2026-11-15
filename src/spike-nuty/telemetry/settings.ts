// Local opt-out of the spike telemetry, remembered on this device only.
import { clearQueue } from './queue.ts';

export const TELEMETRY_KEY = 'grajek.spikeNuty.telemetry';

/** On unless switched off on this device. */
export function isTelemetryEnabled(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Switching off also drops everything still waiting to be sent. */
export function setTelemetryEnabled(on: boolean): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the switch only lasts for this screen.
  }
  if (!on) clearQueue();
}

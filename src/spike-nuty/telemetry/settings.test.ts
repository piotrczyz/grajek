import { beforeEach, describe, expect, it } from 'vitest';
import { enqueue, readQueue } from './queue.ts';
import { isTelemetryEnabled, setTelemetryEnabled, TELEMETRY_KEY } from './settings.ts';

beforeEach(() => {
  localStorage.clear();
});

describe('telemetry settings', () => {
  it('is on by default', () => {
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('remembers the switch on this device', () => {
    setTelemetryEnabled(false);
    expect(localStorage.getItem(TELEMETRY_KEY)).toBe('off');
    expect(isTelemetryEnabled()).toBe(false);
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('clears the queue when switched off', () => {
    enqueue({ kind: 'attempt', attemptId: 'a1', body: {} });
    setTelemetryEnabled(true);
    expect(readQueue()).toHaveLength(1);
    setTelemetryEnabled(false);
    expect(readQueue()).toEqual([]);
  });
});

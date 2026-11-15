import { describe, expect, it } from 'vitest';
import { isSpikeRoute } from './route.ts';

describe('isSpikeRoute', () => {
  it('opens the spike for ?spike=nuty', () => {
    expect(isSpikeRoute('?spike=nuty')).toBe(true);
    expect(isSpikeRoute('?a=1&spike=nuty')).toBe(true);
  });

  it('keeps the app for anything else', () => {
    expect(isSpikeRoute('')).toBe(false);
    expect(isSpikeRoute('?spike=x')).toBe(false);
    expect(isSpikeRoute('?other=nuty')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
// The raw text of firebase.json, exactly as firebase-tools reads it.
import source from '../../firebase.json?raw';

type Header = { source: string; headers: Array<{ key: string; value: string }> };
type Redirect = { source?: string; regex?: string; destination: string; type: number };
type HostingConfig = {
  site: string;
  public: string;
  ignore: string[];
  rewrites?: unknown[];
  redirects?: Redirect[];
  headers?: Header[];
};

const config = JSON.parse(source) as {
  hosting: HostingConfig[];
  functions: unknown;
  firestore: unknown;
};
const hosting = config.hosting;
const site = (id: string) => {
  const found = hosting.find((entry) => entry.site === id);
  if (!found) throw new Error(`no hosting config for site ${id}`);
  return found;
};

const noCache = [{ key: 'Cache-Control', value: 'no-cache' }];
const IGNORE = ['firebase.json', '**/.*', '**/node_modules/**'];
const NEW_ORIGIN = 'https://grajek.web.app';

/**
 * Evaluates one Hosting regex redirect rule on a path: match, then substitute
 * `:N` / `:name` from the capture groups. The Hosting emulator (firebase-tools
 * 15.33) skips a rule whose referenced capture is empty, so an empty capture
 * counts as no match here too. Returns the location, or null.
 */
function applyRule(rule: Redirect, path: string): string | null {
  if (!rule.regex) throw new Error('expected a regex redirect rule');
  const match = new RegExp(rule.regex).exec(path);
  if (!match) return null;
  let skipped = false;
  const location = rule.destination.replace(/:(\w+)/g, (_all, ref: string) => {
    const value = /^\d+$/.test(ref) ? match[Number(ref)] : match.groups?.[ref];
    if (!value) skipped = true;
    return value ?? '';
  });
  return skipped ? null : location;
}

/** Evaluates the rules in order, first match wins, as Hosting does. */
function redirectFor(rules: Redirect[], path: string): string | null {
  for (const rule of rules) {
    const location = applyRule(rule, path);
    if (location !== null) return location;
  }
  return null;
}

describe('firebase.json hosting', () => {
  it('has two configs, app site grajek first, then legacy site grajek-app', () => {
    expect(Array.isArray(hosting)).toBe(true);
    expect(hosting.map((entry) => entry.site)).toEqual(['grajek', 'grajek-app']);
  });

  it('keeps the app config on site grajek unchanged', () => {
    const app = site('grajek');
    expect(app.public).toBe('dist');
    expect(app.ignore).toEqual(IGNORE);
    expect(app.redirects).toBeUndefined();
    expect(app.rewrites).toEqual([
      { source: '/api/**', function: { functionId: 'api', region: 'europe-central2' } },
      { source: '**', destination: '/index.html' },
    ]);
    expect(app.headers).toEqual([
      { source: '/', headers: noCache },
      { source: '/index.html', headers: noCache },
      { source: '/sw.js', headers: noCache },
      { source: '/push-sw.js', headers: noCache },
      { source: '/registerSW.js', headers: noCache },
      { source: '/workbox-*.js', headers: noCache },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
      {
        source: '/assets/**',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]);
  });

  describe('legacy site grajek-app', () => {
    const legacy = site('grajek-app');

    it('serves only its own public dir, with no rewrites', () => {
      expect(legacy.public).toBe('hosting/legacy');
      expect(legacy.ignore).toEqual(IGNORE);
      expect(legacy.rewrites).toBeUndefined();
    });

    it('has two 301 rules to the new address: the root, then every other path', () => {
      expect(legacy.redirects).toHaveLength(2);
      expect(legacy.redirects![0]).toEqual({
        regex: '^/$',
        destination: `${NEW_ORIGIN}/`,
        type: 301,
      });
      for (const rule of legacy.redirects!) {
        expect(rule.type).toBe(301);
        expect(rule.destination.startsWith(`${NEW_ORIGIN}/`)).toBe(true);
      }
    });

    it('uses RE2-compatible regexes (no lookaround, no backreferences)', () => {
      for (const rule of legacy.redirects!) {
        expect(rule.regex).toBeDefined();
        expect(rule.regex).not.toMatch(/\(\?<?[=!]/);
        expect(rule.regex).not.toMatch(/\\[1-9]/);
      }
    });

    it.each([
      ['/', `${NEW_ORIGIN}/`],
      ['/index.html', `${NEW_ORIGIN}/index.html`],
      ['/a/b', `${NEW_ORIGIN}/a/b`],
      ['/assets/x.js', `${NEW_ORIGIN}/assets/x.js`],
      ['/push-sw.js', `${NEW_ORIGIN}/push-sw.js`],
      ['/s', `${NEW_ORIGIN}/s`],
      ['/sw', `${NEW_ORIGIN}/sw`],
      ['/sw.j', `${NEW_ORIGIN}/sw.j`],
      ['/sw.json', `${NEW_ORIGIN}/sw.json`],
      ['/sw.jsx', `${NEW_ORIGIN}/sw.jsx`],
      ['/sw.js/x', `${NEW_ORIGIN}/sw.js/x`],
      ['/a/sw.js', `${NEW_ORIGIN}/a/sw.js`],
    ])('redirects %s to the same path on the new address', (path, location) => {
      expect(redirectFor(legacy.redirects!, path)).toBe(location);
    });

    it('does not redirect /sw.js, which serves the cleanup worker', () => {
      expect(redirectFor(legacy.redirects!, '/sw.js')).toBeNull();
    });

    it('serves /sw.js with no-cache', () => {
      expect(legacy.headers).toEqual([{ source: '/sw.js', headers: noCache }]);
    });
  });
});

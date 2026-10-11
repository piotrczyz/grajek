import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = (file: string) => fileURLToPath(new URL(`../../${file}`, import.meta.url));

interface Rewrite {
  source: string;
  destination?: string;
  function?: { functionId: string; region?: string };
}

const firebaseJson = JSON.parse(readFileSync(root('firebase.json'), 'utf8')) as {
  hosting: Array<{ site: string; rewrites: Rewrite[]; headers: Array<{ source: string }> }>;
  functions: Array<{ source: string; runtime: string }>;
  firestore: { rules: string; indexes: string };
  emulators: Record<string, unknown>;
};

// The app (and its /api/** rewrite) is served from Hosting site `grajek`.
const appHosting = firebaseJson.hosting.find((h) => h.site === 'grajek');

describe('firebase.json', () => {
  const rewrites = appHosting?.rewrites ?? [];

  it('routes /api/** to the api function in europe-central2 before the SPA catch-all', () => {
    const api = rewrites.findIndex((r) => r.source === '/api/**');
    const catchAll = rewrites.findIndex((r) => r.source === '**');
    expect(api).toBeGreaterThanOrEqual(0);
    expect(rewrites[api].function).toEqual({ functionId: 'api', region: 'europe-central2' });
    expect(catchAll).toBe(rewrites.length - 1);
    expect(rewrites[catchAll].destination).toBe('/index.html');
    expect(api).toBeLessThan(catchAll);
  });

  it('serves the push service worker script without caching', () => {
    expect((appHosting?.headers ?? []).map((h) => h.source)).toContain('/push-sw.js');
  });

  it('wires the functions source, Firestore files and emulators', () => {
    expect(firebaseJson.functions[0]).toMatchObject({ source: 'functions', runtime: 'nodejs22' });
    expect(firebaseJson.firestore).toEqual({
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    });
    expect(firebaseJson.emulators).toMatchObject({
      functions: { port: 5001 },
      firestore: { port: 8080 },
      hosting: { port: 5000 },
    });
  });
});

describe('firestore.rules', () => {
  const rules = readFileSync(root('firestore.rules'), 'utf8');
  const code = rules.replace(/\/\/.*$/gm, '');

  it('denies every client read and write', () => {
    expect(code).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  });

  it('grants nothing anywhere', () => {
    expect(code).not.toMatch(/if\s+(?!false\b)/);
    expect(code.match(/allow /g)).toHaveLength(1);
  });
});

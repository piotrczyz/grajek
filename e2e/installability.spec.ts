import { expect, test, type APIRequestContext } from '@playwright/test';

interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

interface WebManifest {
  name: string;
  short_name: string;
  lang: string;
  description?: string;
  display: string;
  orientation: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

async function expectImage(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()['content-type'], url).toMatch(/^image\//);
}

test('serves a complete web app manifest with reachable icons', async ({ page, request }) => {
  await page.goto('./');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).href;

  const response = await request.get(manifestUrl);
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as WebManifest;

  expect(manifest.name).toBe('Grajek');
  expect(manifest.short_name).toBe('Grajek');
  expect(manifest.lang).toBe('pl');
  expect(manifest.description).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('portrait');
  // Relative start_url and scope keep the app installable under any host path.
  expect(manifest.start_url).not.toMatch(/^(\/|https?:)/);
  expect(manifest.scope).not.toMatch(/^(\/|https?:)/);
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);

  const has = (sizes: string, purpose?: string) =>
    manifest.icons.some(
      (icon) => icon.sizes === sizes && (purpose ? icon.purpose === purpose : !icon.purpose),
    );
  expect(has('192x192')).toBe(true);
  expect(has('512x512')).toBe(true);
  expect(has('512x512', 'maskable')).toBe(true);

  for (const icon of manifest.icons) {
    await expectImage(request, new URL(icon.src, manifestUrl).href);
  }
});

test('carries the iOS home screen tags and Polish language', async ({ page, request }) => {
  await page.goto('./');

  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(touchIcon).toBeTruthy();
  await expectImage(request, new URL(touchIcon!, page.url()).href);

  const meta = (name: string) => page.locator(`meta[name="${name}"]`);
  await expect(meta('apple-mobile-web-app-capable')).toHaveAttribute('content', 'yes');
  await expect(meta('mobile-web-app-capable')).toHaveAttribute('content', 'yes');
  await expect(meta('apple-mobile-web-app-title')).toHaveAttribute('content', 'Grajek');
  await expect(meta('apple-mobile-web-app-status-bar-style')).toHaveAttribute('content', /.+/);
  await expect(meta('theme-color')).toHaveAttribute('content', /^#[0-9a-f]{6}$/i);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', /.+/);
});

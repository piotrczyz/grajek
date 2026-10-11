import { expect, test } from '@playwright/test';

// The build gets a test-only VAPID public key (playwright.config.ts webServer env).
// No real subscription is attempted: there is no push service in CI.

// Headless Chromium always reports Notification.permission as 'denied' (even with the
// permission granted), so the page sees the state of a phone that has not been asked yet.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'default' });
  });
});

test('the welcome screen offers to turn on reminders', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 2, name: 'Powiadomienia' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Włącz przypomnienia' })).toBeVisible();
});

test('the production service worker includes the push handler', async ({ page }) => {
  await page.goto('./');
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL ?? '';
  });
  expect(scriptUrl).toMatch(/\/sw\.js$/);

  const sw = await page.request.get(scriptUrl);
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain('importScripts("push-sw.js")');

  const handler = await page.request.get(new URL('push-sw.js', scriptUrl).href);
  expect(handler.ok()).toBe(true);
  const source = await handler.text();
  expect(source).toContain("addEventListener('push'");
  expect(source).toContain("addEventListener('notificationclick'");
});

import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __swUpdateCalls: number;
  }
}

test('returning to the foreground asks the browser for a new service worker', async ({ page }) => {
  // Count update checks without changing what they do.
  await page.addInitScript(() => {
    window.__swUpdateCalls = 0;
    const original = ServiceWorkerRegistration.prototype.update;
    ServiceWorkerRegistration.prototype.update = function (this: ServiceWorkerRegistration) {
      window.__swUpdateCalls += 1;
      return original.call(this);
    };
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Grajek' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Simulate the installed app going to the background and coming back.
  const goHiddenThenVisible = () =>
    page.evaluate(() => {
      const setState = (state: DocumentVisibilityState) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      setState('hidden');
      setState('visible');
    });

  // Registration resolves asynchronously; a check before it is a no-op, so repeat until one lands.
  await expect
    .poll(async () => {
      await goHiddenThenVisible();
      return page.evaluate(() => window.__swUpdateCalls);
    })
    .toBeGreaterThan(0);

  // Still the same app, nothing reloaded away from it.
  await expect(page.getByRole('heading', { level: 1, name: 'Grajek' })).toBeVisible();
});

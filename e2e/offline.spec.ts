import { expect, test } from '@playwright/test';

test('reloading without network still shows the welcome screen', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Grajek' })).toBeVisible();

  // Wait until the service worker is active, then make sure it controls this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!controlled) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Grajek' })).toBeVisible();
  await expect(
    page.getByText('Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie.'),
  ).toBeVisible();
});

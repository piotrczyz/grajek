import { expect, test, type Page } from '@playwright/test';

const expectProfile = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(page.getByText('Gitara')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gotowe' })).toHaveCount(0);
};

test('the profile survives a reload, online and offline', async ({ page, context }) => {
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expectProfile(page);

  await page.reload();
  await expectProfile(page);

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
  await expectProfile(page);
});

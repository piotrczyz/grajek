import { expect, test, type Page } from '@playwright/test';

// 2026-10-14 is a Wednesday ("środa"); the clock is fixed so "today" is stable.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

const expectTodaysOverride = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(page.getByText('Dziś: 15:00 · Szkoła')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zmień' })).toBeVisible();
};

test('the practice time survives a reload, online and offline', async ({ page, context }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();

  await page.getByRole('button', { name: 'Ustal porę ćwiczeń' }).click();
  await page.getByLabel('O której ćwiczysz?').fill('16:30');
  await page.getByLabel('Gdzie ćwiczysz?').fill('U babci');
  await page.getByRole('button', { name: 'środa' }).click();
  await page.getByLabel('O której ćwiczysz – środa?').fill('15:00');
  await page.getByLabel('Gdzie ćwiczysz – środa?').fill('Szkoła');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expectTodaysOverride(page);

  await page.reload();
  await expectTodaysOverride(page);

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
  await expectTodaysOverride(page);
});

import { expect, test, type Page } from '@playwright/test';

// 2026-10-14 is a Wednesday; the clock is fixed so the current week is stable.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

const goalStatus = (page: Page) => page.getByRole('region', { name: 'Cel tygodnia' }).getByRole('status');

test('the weekly goal shows progress after a log and survives an offline reload', async ({ page, context }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Ustal cel tygodnia' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^3 dni/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /^4 dni/ }).click();
  await page.getByRole('button', { name: 'Ustaw cel' }).click();
  await expect(goalStatus(page)).toHaveText('0 z 4 dni');

  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByText('Super! Zapisane.')).toBeVisible();
  await expect(goalStatus(page)).toHaveText('1 z 4 dni');

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
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(goalStatus(page)).toHaveText('1 z 4 dni');
});

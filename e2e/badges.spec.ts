import { expect, test } from '@playwright/test';

// 2026-10-14 is a Wednesday; the clock is fixed so the saved day is stable.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

test('the first badges are announced after a save and stay in the collection offline', async ({ page, context }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Moje odznaki' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await page.getByRole('radio', { name: '60 min' }).click();
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(page.getByText('Super! Zapisane.')).toBeVisible();

  await expect(page.getByText('Nowe odznaki')).toBeVisible();
  await expect(page.getByText('Pierwszy dzień z muzyką')).toBeVisible();
  await expect(page.getByText('Pierwsza godzina z muzyką')).toBeVisible();
  await page.getByRole('button', { name: 'Super!', exact: true }).click();
  await expect(page.getByText('Nowe odznaki')).toHaveCount(0);

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

  const toggle = page.getByRole('button', { name: 'Moje odznaki' });
  await expect(toggle).toBeVisible();
  await expect(page.getByText(/Nowa odznaka|Nowe odznaki|dotychczasowe ćwiczenia/)).toHaveCount(0);

  await toggle.click();
  const collection = page.getByRole('list', { name: 'Zdobyte odznaki' });
  await expect(collection.getByRole('listitem')).toHaveCount(2);
  await expect(collection.getByRole('listitem').nth(0)).toContainText('Pierwszy dzień z muzyką');
  await expect(collection.getByRole('listitem').nth(1)).toContainText('Pierwsza godzina z muzyką');
});

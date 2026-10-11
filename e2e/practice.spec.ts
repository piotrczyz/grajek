import { expect, test } from '@playwright/test';

test('a practice session logged offline in 3 taps survives an offline reload', async ({ page, context }) => {
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();

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

  const week = page.getByRole('list', { name: 'Ten tydzień' });
  const today = week.getByRole('listitem', { name: /\(dziś\)$/ });
  await expect(week.getByRole('listitem')).toHaveCount(7);
  await expect(today).not.toHaveAccessibleName(/Dzień z muzyką/);

  // Tap 1: open, tap 2: pick a duration, tap 3: save.
  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await page.getByRole('radio', { name: '20 min' }).click();
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByText('Super! Zapisane.')).toBeVisible();
  await expect(today).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(today).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/);
  await expect(week.getByRole('listitem', { name: /Dzień z muzyką/ })).toHaveCount(1);
});

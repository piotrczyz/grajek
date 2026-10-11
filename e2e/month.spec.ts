import { expect, test } from '@playwright/test';

test('the month view shows a session logged offline, also after an offline reload', async ({ page, context }) => {
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

  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await page.getByRole('radio', { name: '20 min' }).click();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Super! Zapisane.')).toBeVisible();

  const toggle = page.getByRole('button', { name: 'Mój miesiąc' });
  const month = page.getByRole('list', { name: 'Ten miesiąc' });
  const today = month.getByRole('listitem', { name: /\(dziś\)$/ });

  async function expectOneMusicDay() {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(today).toHaveAccessibleName(/: Dzień z muzyką \(dziś\)$/);
    await expect(month.getByRole('listitem', { name: /Dzień z muzyką/ })).toHaveCount(1);
    await expect(page.getByText('Dni z muzyką w tym miesiącu: 1')).toBeVisible();
    await expect(page.getByText('Razem: 1 dzień z muzyką · 20 min')).toBeVisible();
  }

  await expectOneMusicDay();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expectOneMusicDay();
});

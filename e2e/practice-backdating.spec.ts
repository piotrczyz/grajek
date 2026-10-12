import { expect, test } from '@playwright/test';

// 2026-10-14 is a Wednesday; the clock is fixed so Monday is 2 days back.
const WEDNESDAY = new Date(2026, 9, 14, 10, 0);

test('a session logged for a past day by tapping it in the week survives an offline reload', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(WEDNESDAY);
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
  const monday = week.getByRole('listitem').first();
  await expect(monday).toHaveAccessibleName('Poniedziałek');

  await week.getByRole('button', { name: 'Poniedziałek: dopisz granie' }).click();
  await expect(page.getByRole('radio', { name: 'Przedwczoraj' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();

  await expect(page.getByText('Super! Dopisane do poniedziałku.')).toBeVisible();
  await expect(monday).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(monday).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');
  await expect(week.getByRole('listitem', { name: /Dzień z muzyką/ })).toHaveCount(1);
});

import { expect, test } from '@playwright/test';

test('a second instrument is added, chosen when logging and remembered after an offline reload', async ({
  page,
  context,
}) => {
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

  // With one instrument the log panel offers no instrument choice.
  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Na czym grałeś?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Anuluj' }).click();

  const toggle = page.getByRole('button', { name: 'Moje instrumenty' });
  const instruments = page.getByRole('list', { name: 'Moje instrumenty' });
  await toggle.click();
  await expect(instruments.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Dodaj instrument' }).click();
  const presets = page.getByRole('radiogroup', { name: 'Jaki instrument dodajesz?' });
  await expect(presets.getByRole('radio', { name: 'Gitara' })).toHaveCount(0);
  await presets.getByRole('radio', { name: 'Pianino' }).click();
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await expect(instruments.getByRole('listitem')).toHaveCount(2);
  await toggle.click();

  // Two instruments: the oldest is preselected; pick Pianino and save.
  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  const choice = page.getByRole('radiogroup', { name: 'Na czym grałeś?' });
  await expect(choice.getByRole('radio', { name: 'Gitara' })).toHaveAttribute('aria-checked', 'true');
  await choice.getByRole('radio', { name: 'Pianino' }).click();
  await page.getByRole('radio', { name: '20 min' }).click();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Super! Zapisane.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();

  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await expect(choice.getByRole('radio', { name: 'Pianino' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Anuluj' }).click();

  await toggle.click();
  const piano = instruments.getByRole('listitem').filter({ hasText: 'Pianino' });
  const guitar = instruments.getByRole('listitem').filter({ hasText: 'Gitara' });
  await expect(piano).toContainText('1 dzień z muzyką · 20 min');
  await expect(guitar).toContainText('Jeszcze przed Tobą');
  await expect(page.getByText('Razem: 1 dzień z muzyką · 20 min')).toBeVisible();
});

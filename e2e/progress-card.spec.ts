import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __sharedFiles?: File[];
  }
}

/** Creates a profile, checks the card button is absent, logs one practice and goes offline. */
async function logPracticeOffline(page: Page, setOffline: (offline: boolean) => Promise<void>) {
  await page.goto('./');
  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pokaż rodzinie' })).toHaveCount(0);

  // Wait until the service worker controls the page so the app keeps working offline.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!controlled) {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }

  await page.getByRole('button', { name: 'Zagrałem!' }).click();
  await page.getByRole('radio', { name: '20 min' }).click();
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Super! Zapisane.')).toBeVisible();

  await setOffline(true);
}

test('offline, the card is shared as a 1080x1080 PNG through the system share sheet', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__sharedFiles = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data?: ShareData) => Array.isArray(data?.files) && data.files.length > 0,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data?: ShareData) => {
        window.__sharedFiles?.push(...(data?.files ?? []));
      },
    });
  });

  await logPracticeOffline(page, (offline) => context.setOffline(offline));
  await page.getByRole('button', { name: 'Pokaż rodzinie' }).click();

  await page.waitForFunction(() => (window.__sharedFiles?.length ?? 0) > 0);
  const shared = await page.evaluate(async () => {
    const files = window.__sharedFiles ?? [];
    const bitmap = await createImageBitmap(files[0]);
    return { count: files.length, name: files[0].name, type: files[0].type, width: bitmap.width, height: bitmap.height };
  });
  expect(shared).toEqual({ count: 1, name: 'karta-postepu.png', type: 'image/png', width: 1080, height: 1080 });
  await expect(page.getByText('Obrazek zapisany.')).toHaveCount(0);
});

test('offline, without file sharing the card is downloaded', async ({ page, context }) => {
  await page.addInitScript(() => {
    for (const key of ['share', 'canShare'] as const) {
      Object.defineProperty(navigator, key, { configurable: true, value: undefined });
    }
  });

  await logPracticeOffline(page, (offline) => context.setOffline(offline));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pokaż rodzinie' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('karta-postepu.png');
  await expect(page.getByText('Obrazek zapisany.')).toBeVisible();
});

import { expect, test } from '@playwright/test';

// The hidden "Zagraj i sprawdź" spike on a 360 px phone: the note-by-note list
// must not clip any text (owner feedback: "dobrz" instead of "dobrze").
// Chromium's fake microphone feeds a beep, so a short recording reaches the
// result view without a real instrument.
test.use({
  viewport: { width: 360, height: 800 },
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

const STATUS_WORDS = ['dobrze', 'za późno', 'za wcześnie', 'zły rytm', 'zła nuta', 'brak', 'dodatkowa'];

test('the note-by-note list is readable at 360 px', async ({ page }) => {
  // Telemetry stays on the device: the preview server has no API.
  await page.route('**/api/**', (route) => route.fulfill({ status: 204 }));
  await page.goto('./?spike=nuty');

  await page.getByLabel('Czas na przygotowanie').selectOption('3');
  await page.getByRole('button', { name: 'Start' }).click();
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(1500);
  await stop.click();

  const region = page.getByRole('region', { name: 'Nuta po nucie' });
  await expect(region.getByRole('table')).toBeVisible();

  const layout = await region.evaluate((section) => {
    const table = section.querySelector('table') as HTMLTableElement;
    const cells = [...table.querySelectorAll('th, td')] as HTMLElement[];
    return {
      tableWidth: table.scrollWidth,
      sectionWidth: section.clientWidth,
      clipped: cells.filter((cell) => cell.scrollWidth > cell.clientWidth).map((cell) => cell.textContent),
      statuses: [...table.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[5]?.textContent ?? ''),
    };
  });
  expect(layout.clipped).toEqual([]);
  expect(layout.tableWidth).toBeLessThanOrEqual(layout.sectionWidth);
  expect(layout.statuses.length).toBeGreaterThan(0);
  for (const status of layout.statuses) expect(STATUS_WORDS).toContain(status);
  // The full word is on screen, not cut to "dobrz".
  await expect(region.getByRole('cell', { name: layout.statuses[0], exact: true }).first()).toBeVisible();
});

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

  // A beep never plays the melody, so the rows above are mostly short ("brak").
  // Fill every row with the longest texts the list can show and measure again,
  // first with the device font, then with a wide one at a larger size (ubuntu CI
  // renders with DejaVu Sans, which is wider than the Windows/Android default).
  const measureWorstCase = (font: { family: string; size: string } | null) =>
    region.evaluate((section, wide) => {
      const fixed = ['15', 'Fis4', 'Gis5', '\u22121200'];
      const timings = ['\u22121180 ms', '+1180 ms', 'za krótko', 'za długo'];
      const grades = ['za wcześnie', 'dodatkowa', 'zła nuta'];
      const table = section.querySelector('table') as HTMLTableElement;
      table.style.fontFamily = wide ? wide.family : '';
      table.style.fontSize = wide ? wide.size : '';
      for (const [i, row] of [...table.querySelectorAll('tbody tr')].entries()) {
        const cells = row.querySelectorAll('td');
        fixed.forEach((text, column) => {
          cells[column].textContent = text;
        });
        cells[4].textContent = timings[i % timings.length];
        const word = cells[5].querySelectorAll('span');
        word[word.length - 1].textContent = grades[i % grades.length];
      }
      const all = [...table.querySelectorAll('th, td')] as HTMLElement[];
      return {
        tableWidth: table.scrollWidth,
        sectionWidth: section.clientWidth,
        clipped: all.filter((cell) => cell.scrollWidth > cell.clientWidth).map((cell) => cell.textContent),
      };
    }, font);

  const worstCase = await measureWorstCase(null);
  expect(worstCase.clipped).toEqual([]);
  expect(worstCase.tableWidth).toBeLessThanOrEqual(worstCase.sectionWidth);

  const wideFont = await measureWorstCase({ family: '"DejaVu Sans", Verdana, sans-serif', size: '14px' });
  expect(wideFont.clipped).toEqual([]);
  expect(wideFont.tableWidth).toBeLessThanOrEqual(wideFont.sectionWidth);
});

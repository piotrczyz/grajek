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
  await expect(page.getByRole('radio', { name: 'Poniedziałek' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Zapisz', exact: true }).click();

  await expect(page.getByText('Super! Dopisane do poniedziałku.')).toBeVisible();
  await expect(monday).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cześć, Ola!' })).toBeVisible();
  await expect(monday).toHaveAccessibleName('Poniedziałek: Dzień z muzyką');
  await expect(week.getByRole('listitem', { name: /Dzień z muzyką/ })).toHaveCount(1);
});

test('the day choice is one timeline row that fits a 360 px phone, today on the right', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('./');

  await page.getByLabel('Jak masz na imię? Może być pseudonim.').fill('Ola');
  await page.getByRole('radio', { name: 'Gitara' }).click();
  await page.getByRole('button', { name: 'Gotowe' }).click();
  await page.getByRole('button', { name: 'Zagrałem!' }).click();

  const chips = page.getByRole('radiogroup', { name: 'Kiedy grałeś?' }).getByRole('radio');
  await expect(chips).toHaveText(['Nd', 'Pn', 'Wczoraj', 'Dziś']);
  await expect(chips.last()).toHaveAttribute('aria-checked', 'true');

  const boxes = [];
  for (const chip of await chips.all()) {
    const box = await chip.boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
    // No wrapping or clipping: the label fits on one line inside the chip.
    const fits = await chip.evaluate((element) => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      const range = document.createRange();
      range.selectNodeContents(element);
      return element.scrollWidth <= element.clientWidth && range.getClientRects().length === 1 && range.getBoundingClientRect().height <= lineHeight * 1.5;
    });
    expect(fits).toBe(true);
  }
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].y).toBeCloseTo(boxes[0].y, 0);
    expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x + boxes[i - 1].width - 1);
  }
  const last = boxes[boxes.length - 1];
  expect(last.x + last.width).toBeLessThanOrEqual(360);
});

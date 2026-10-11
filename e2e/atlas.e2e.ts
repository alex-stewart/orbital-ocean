import { expect, test, type Page } from '@playwright/test';

/** Fail on any page error or console error. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('the library opens the atlas', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'The Imperial Reference Shelf' })).toBeVisible();
  await page.getByRole('link', { name: 'The Atlas' }).first().click();
  await expect(page.locator('canvas.atlas-canvas')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Major islands' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the island strip flies to a continent and the gazetteer describes it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('#/atlas');
  await page.getByRole('button', { name: 'Mort', exact: true }).click();
  await expect(page.locator('.gz-entry-head h2')).toHaveText('Mort');
  await expect(page.locator('.gz-section', { hasText: 'Settlements' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('back returns to the previous place', async ({ page }) => {
  await page.goto('#/atlas');
  await page.getByRole('button', { name: 'Mort', exact: true }).click();
  await expect(page.locator('.gz-entry-head h2')).toHaveText('Mort');
  await page.getByRole('button', { name: 'Brock', exact: true }).click();
  await expect(page.locator('.gz-entry-head h2')).toHaveText('Brock');
  await page.goBack();
  await expect(page.locator('.gz-entry-head h2')).toHaveText('Mort');
});

test('the sea index lists shipping routes, which open', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('#/atlas');
  await page.getByRole('tab', { name: 'Sea' }).click();
  const first = page.locator('.gz-list button').first();
  await expect(first).toContainText('⇄', { timeout: 20_000 });
  await first.click();
  await expect(page.locator('.gz-kind')).toContainText('cargo route');
  await expect(page.locator('.gz-section', { hasText: 'Calls at' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the belt index opens an archipelago, its islands and their ferries', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('#/atlas');
  await page.locator('summary', { hasText: 'The War Belt' }).click();
  // The most populous archipelago is listed first.
  const first = page.locator('details:has(summary:has-text("The War Belt")) .gz-list button').first();
  await expect(first).toContainText('places', { timeout: 20_000 });
  await first.click();
  await expect(page.locator('.gz-kind')).toContainText('Archipelago of the War Belt');
  await expect(page.locator('.gz-section', { hasText: 'Ferries' })).toBeVisible();
  await page.locator('.gz-section', { hasText: 'Islands' }).locator('.gz-list button').first().click();
  await expect(page.locator('.gz-kind')).toContainText('Island of the');
  await expect(page.locator('.gz-crumbs')).toContainText(/The .+/);
  expect(errors).toEqual([]);
});

test('search finds a platform by its number', async ({ page }) => {
  await page.goto('#/atlas');
  await page.getByRole('searchbox', { name: /find a place/i }).fill('1423');
  await page.keyboard.press('Enter');
  await expect(page.locator('.gz-entry-head h2')).toHaveText(/HPBE-[PX]-01423/);
});

test('measuring between two places', async ({ page }) => {
  await page.goto('#/atlas?place=mort');
  await page.getByRole('button', { name: 'Measure' }).click();
  await expect(page.locator('.measure-banner')).toContainText('Measuring from Mort');
  await page.keyboard.press('Escape');
  await expect(page.locator('.measure-banner')).toHaveCount(0);
});

test('the timeline expands and steps by day', async ({ page }) => {
  await page.goto('#/atlas?date=1000-1-1');
  await expect(page.locator('.date-compact')).toContainText('1st of Month I');
  await page.keyboard.press(']');
  await expect(page.locator('.date-compact')).toContainText('2nd of Month I');
  await page.getByRole('button', { name: 'Expand the timeline' }).click();
  await expect(page.getByRole('button', { name: 'Forward one year' })).toBeVisible();
});

test('a shared link restores the view', async ({ page }) => {
  await page.goto('#/atlas?date=1000-1-1&view=-2895,2832,0.9242');
  await expect(page.locator('.scalebar-rf')).toContainText('4,100,000');
});

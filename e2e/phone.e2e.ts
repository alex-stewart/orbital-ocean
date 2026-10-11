import { expect, test } from '@playwright/test';

test('on a phone the strip condenses and the gazetteer is a sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('#/atlas?place=mort');
  await expect(page.locator('.quick-select')).toHaveClass(/mode-numbers/);
  await expect(page.locator('.gazetteer')).toHaveClass(/closed/);
  await page.locator('.gz-title').click();
  await expect(page.locator('.gz-entry-head h2')).toHaveText('Mort');
  expect(errors).toEqual([]);
});

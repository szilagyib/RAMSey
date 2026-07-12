import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// Canvas background: dots (default) -> grid -> none, from the toolbar button,
// persisted across reloads.
test('background toggle cycles dots / grid / none and persists', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Background');

  const pattern = page.locator('.react-flow__background');
  const toggle = page.getByTitle(/^Background:/);

  await test.step('default is dots', async () => {
    await expect(pattern).toBeVisible();
    await expect(toggle).toHaveAttribute('title', /dots/);
  });

  await test.step('cycles to grid (lines)', async () => {
    await toggle.click();
    await expect(page.getByTitle(/^Background: grid/)).toBeVisible();
    await expect(pattern).toBeVisible();
    // Lines variant renders <path>, dots render <circle>.
    await expect(pattern.locator('path')).toHaveCount(1);
  });

  await test.step('cycles to none (background removed)', async () => {
    await page.getByTitle(/^Background: grid/).click();
    await expect(page.getByTitle(/^Background: none/)).toBeVisible();
    await expect(pattern).toHaveCount(0);
  });

  await test.step('survives a reload', async () => {
    await page.reload();
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.react-flow__background')).toHaveCount(0);
  });
});

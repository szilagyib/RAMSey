import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// The palette and the properties/analysis panel each collapse to a rail, giving
// the canvas the full width. The choice is a workspace preference, so it sticks.
test('palette and inspector collapse, and stay collapsed across a reload', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Collapse panels');

  const palette = page.getByText('Operational', { exact: true });
  const inspector = page.getByText(/Select a node or edge/i);
  await expect(palette).toBeVisible();
  await expect(inspector).toBeVisible();

  await page.getByRole('button', { name: 'Collapse palette' }).click();
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show palette' })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show properties and analysis' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.react-flow')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show palette' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show properties and analysis' })).toBeVisible();

  // Re-expanding from the rails brings both back.
  await page.getByRole('button', { name: 'Show palette' }).click();
  await page.getByRole('button', { name: 'Show properties and analysis' }).click();
  await expect(palette).toBeVisible();
  await expect(inspector).toBeVisible();
});

// We keep React Flow's attribution (the library is MIT and its authors ask for
// the credit) — restyled, not removed.
test('the React Flow attribution is kept', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Attribution');

  const link = page.locator('.react-flow__attribution a');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /reactflow\.dev/);
});

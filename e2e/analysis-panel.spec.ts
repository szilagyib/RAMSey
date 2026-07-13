import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// Analysis used to open as a card floating over the canvas whose only dismiss
// was a near-invisible × — it covered the diagram (and the minimap) and looked
// stuck open. It is now a tab in the right sidebar.
test('analysis runs in the sidebar and is dismissed by switching tabs', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Analysis sidebar');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page.locator('input[type="file"]').setInputFiles('examples/markov-redundant-power.json');
  await expect(page.locator('.react-flow').getByText('β')).toBeVisible();

  const sidebar = page.locator('aside').last();

  await page.getByRole('button', { name: 'Analysis', exact: true }).first().click();
  await page.getByText('Run Analysis...').click();

  // The panel lives inside the sidebar, not floating over the canvas.
  await expect(sidebar.getByRole('button', { name: 'Run analysis' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Run analysis' }).click();
  await expect(sidebar.getByText('availability', { exact: true })).toBeVisible();

  // Switching back to Properties dismisses it — no hunting for a close button.
  await sidebar.getByRole('button', { name: 'Properties' }).click();
  await expect(sidebar.getByRole('button', { name: 'Run analysis' })).toHaveCount(0);
  await expect(sidebar.getByText(/Select a node or edge/i)).toBeVisible();

  // Reopening keeps the result (it is cached per diagram).
  await sidebar.getByRole('button', { name: 'Analysis' }).click();
  await expect(sidebar.getByText('availability', { exact: true })).toBeVisible();
});

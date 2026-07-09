import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// The shipped example must load through the real UI: File → Import JSON…
test('example Markov file imports and renders', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Import target'); // guest markov diagram (empty)

  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-redundant-power.json');

  // All four states render, including the absorbing blackout state.
  const canvas = page.locator('.react-flow');
  for (const label of ['OK', 'DEG', 'BAT', 'OUT']) {
    await expect(canvas.getByText(label, { exact: true })).toBeVisible();
  }
  // Transition rate labels render too.
  await expect(canvas.getByText('2λ')).toBeVisible();
  await expect(canvas.getByText('β')).toBeVisible();

  await page.screenshot({ path: 'test-results/visual/example-import.png' });
});

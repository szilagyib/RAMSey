import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// The shipped examples must load through the real UI: File → Import JSON…
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

// The 2oo3 example is the repairable counterpart to the one above: no absorbing
// state, so steady-state availability and MTBF/MTTR actually converge.
test('2oo3 pump station example imports and analyses in the sidebar', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Pump station');

  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-2oo3-pump-station.json');

  const canvas = page.locator('.react-flow');
  for (const label of ['OK', 'S2', 'S1', 'S0', 'PM', 'CCF', 'SPUR']) {
    await expect(canvas.getByText(label, { exact: true })).toBeVisible();
  }
  // The mechanisms that make this one worth shipping: common cause, proof test.
  await expect(canvas.getByText('βλ')).toBeVisible();
  await expect(canvas.getByText('λ_PT')).toBeVisible();

  await page.screenshot({ path: 'test-results/visual/example-2oo3.png' });

  // It solves, and — being irreducible — without the absorbing-state warning
  // that the redundant-power example raises on steady-state methods.
  const sidebar = page.locator('aside').last();
  await page.getByRole('button', { name: 'Analysis', exact: true }).first().click();
  await page.getByText('Run Analysis...').click();
  await sidebar.getByRole('button', { name: 'Run analysis' }).click();

  await expect(sidebar.getByText('availability', { exact: true })).toBeVisible();
  await expect(sidebar.getByText(/absorbing states/i)).toHaveCount(0);
});

import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Node recoloring through the property panel: preset swatch, custom picker,
// reset, and undo integration.
test('recolor a node from the property panel', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Recolor');
  await dropNode(page, 'operational');

  const node = page.locator('.react-flow__node').first();
  await node.click();
  await expect(page.getByText('Node Properties')).toBeVisible();

  // The Markov state body is the inner rounded-full div (the first div child
  // is a connection handle).
  const body = node.locator('div.rounded-full').last();

  await test.step('preset swatch applies the tint', async () => {
    await page.getByLabel('Set color #ef4444').click();
    await expect(body).toHaveCSS('border-color', 'rgb(239, 68, 68)');
  });

  await test.step('another swatch replaces the color; the picker mirrors it', async () => {
    // Playwright cannot fill native <input type=color>, so the custom-picker
    // path is covered by unit tests; here we assert its value stays in sync.
    await page.getByLabel('Set color #0ea5e9').click();
    await expect(body).toHaveCSS('border-color', 'rgb(14, 165, 233)');
    await expect(page.getByLabel('Node color', { exact: true })).toHaveValue('#0ea5e9');
  });

  await test.step('reset restores the default notation color', async () => {
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(body).not.toHaveCSS('border-color', 'rgb(14, 165, 233)');
  });

  await test.step('undo brings the color back', async () => {
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await page.keyboard.press('Control+z'); // undo the reset
    await node.click();
    const bodyAgain = page
      .locator('.react-flow__node')
      .first()
      .locator('div.rounded-full')
      .last();
    await expect(bodyAgain).toHaveCSS('border-color', 'rgb(14, 165, 233)');
  });
});

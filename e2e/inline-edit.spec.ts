import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Double-click a node or edge label to rename it on the canvas.
test('inline label editing on nodes and edges', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Inline edit');
  const canvas = page.locator('.react-flow');

  await dropNode(page, 'operational', 420, 260);
  const node = page.locator('.react-flow__node').first();
  await expect(canvas.getByText('S0')).toBeVisible();

  await test.step('double-click a node, type, Enter commits', async () => {
    await node.dblclick();
    const input = page.locator('.react-flow__viewport-portal input');
    await expect(input).toBeVisible();
    await input.fill('Pump OK');
    await input.press('Enter');

    await expect(page.locator('.react-flow__viewport-portal input')).toHaveCount(0);
    await expect(canvas.getByText('Pump OK')).toBeVisible();
  });

  await test.step('Escape cancels without changing the label', async () => {
    await node.dblclick();
    const input = page.locator('.react-flow__viewport-portal input');
    await input.fill('Discarded');
    await input.press('Escape');

    await expect(canvas.getByText('Pump OK')).toBeVisible();
    await expect(canvas.getByText('Discarded')).toHaveCount(0);
  });

  await test.step('edge labels are editable too', async () => {
    // Import the example, which has labelled edges.
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByText('Import JSON...').click();
    page.once('dialog', (d) => d.accept()); // "replaces the current diagram"
    await page
      .locator('input[type="file"]')
      .setInputFiles('examples/markov-redundant-power.json');
    await expect(canvas.getByText('β')).toBeVisible();

    await canvas.getByText('β').dblclick();
    const input = page.locator('.react-flow__edgelabel-renderer input');
    await expect(input).toBeVisible();
    await input.fill('β2');
    await input.press('Enter');

    await expect(canvas.getByText('β2')).toBeVisible();
  });
});

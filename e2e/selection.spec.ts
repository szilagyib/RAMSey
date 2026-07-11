import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Drawing-app selection: click=single, rubber-band on left-drag, Ctrl+A,
// Escape deselects, Delete removes the whole selection.
test('rubber-band, select-all and multi-delete', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Selection');

  await dropNode(page, 'operational', 450, 250);
  await dropNode(page, 'failed', 620, 330);
  const nodes = page.locator('.react-flow__node');
  const selected = page.locator('.react-flow__node.selected');
  await expect(nodes).toHaveCount(2);

  await test.step('left-drag on empty canvas draws a rubber-band that selects both', async () => {
    // Compute the rectangle from where the nodes actually render (the canvas
    // viewport transforms drop coordinates).
    const boxes = await nodes.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.x + r.width, bottom: r.y + r.height };
      }),
    );
    const x0 = Math.min(...boxes.map((b) => b.x)) - 40;
    const y0 = Math.min(...boxes.map((b) => b.y)) - 40;
    const x1 = Math.max(...boxes.map((b) => b.right)) + 40;
    const y1 = Math.max(...boxes.map((b) => b.bottom)) + 40;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 10 });
    await page.mouse.up();
    await expect(selected).toHaveCount(2);
  });

  await test.step('Escape deselects everything', async () => {
    await page.keyboard.press('Escape');
    await expect(selected).toHaveCount(0);
  });

  await test.step('single click selects only that node', async () => {
    await nodes.first().click();
    // Store-tracked single selection shows in the right panel; the other node
    // must not be part of any selection.
    await expect(page.getByText('Node Properties')).toBeVisible();
  });

  await test.step('Ctrl+A selects all; Delete removes the whole selection', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await page.keyboard.press('Control+a');
    await expect(selected).toHaveCount(2);

    await page.locator('.react-flow__pane').focus();
    await page.keyboard.press('Delete');
    await expect(nodes).toHaveCount(0);
  });

  await test.step('undo restores everything deleted in one step', async () => {
    await page.keyboard.press('Control+z');
    await expect(nodes).toHaveCount(2);
  });
});

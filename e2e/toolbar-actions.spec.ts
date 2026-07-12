import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// The toolbar editing icons drive the same store actions as the Edit menu.
test('toolbar undo/copy/paste buttons act on the diagram', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Toolbar actions');
  await dropNode(page, 'operational', 450, 260);
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(1);

  await test.step('Undo button reverts the add and disables when exhausted', async () => {
    await page.getByTitle('Undo (Ctrl+Z)').click();
    await expect(nodes).toHaveCount(0);
    await expect(page.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
  });

  await test.step('Redo button re-adds it', async () => {
    await page.getByTitle('Redo (Ctrl+Shift+Z)').click();
    await expect(nodes).toHaveCount(1);
  });

  await test.step('Copy then Paste via toolbar adds a clone', async () => {
    await nodes.first().click();
    await page.getByTitle('Copy (Ctrl+C)').click();
    await page.getByTitle('Paste (Ctrl+V)').click();
    await expect(nodes).toHaveCount(2);
  });

  await test.step('Duplicate button adds another', async () => {
    await page.getByTitle('Duplicate (Ctrl+D)').click();
    await expect(nodes).toHaveCount(3);
  });
});

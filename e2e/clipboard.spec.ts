import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Clipboard through the real UI: Ctrl+C / Ctrl+V / Ctrl+D and undo integration.
test('copy, paste and duplicate nodes with the keyboard', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Clipboard');

  await dropNode(page, 'operational');
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(1);

  await test.step('Ctrl+C / Ctrl+V pastes an offset clone', async () => {
    await nodes.first().click();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(nodes).toHaveCount(2);
  });

  await test.step('Ctrl+D duplicates the pasted node', async () => {
    await page.keyboard.press('Control+d');
    await expect(nodes).toHaveCount(3);
  });

  await test.step('paste is one undo step', async () => {
    await page.keyboard.press('Control+z');
    await expect(nodes).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(nodes).toHaveCount(1);
  });
});

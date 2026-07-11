import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Undo/redo through the real UI: keyboard shortcuts and the Edit menu.
test('undo/redo: keyboard and Edit menu revert diagram edits', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Undo redo');

  const canvas = page.locator('.react-flow');

  await test.step('Ctrl+Z undoes adding a node; Ctrl+Shift+Z redoes it', async () => {
    await dropNode(page, 'operational');
    await expect(canvas.getByText('S0')).toBeVisible();

    await page.keyboard.press('Control+z');
    await expect(canvas.getByText('S0')).not.toBeVisible();

    await page.keyboard.press('Control+Shift+z');
    await expect(canvas.getByText('S0')).toBeVisible();
  });

  await test.step('Edit menu Undo reverts a delete', async () => {
    await page.locator('.react-flow__node').first().click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Delete Selected').click();
    await expect(canvas.getByText('S0')).not.toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Undo', { exact: true }).click();
    await expect(canvas.getByText('S0')).toBeVisible();
  });

  await test.step('Redo is disabled after a fresh edit', async () => {
    await page.keyboard.press('Control+z'); // undo the restore? no — undo delete-undo state
    await page.keyboard.press('Control+Shift+z'); // back
    await dropNode(page, 'failed'); // fresh edit clears redo
    await page.getByRole('button', { name: 'Edit' }).click();
    const redoItem = page.getByText('Redo', { exact: true });
    await expect(redoItem).toBeDisabled();
  });
});

test('undo/redo works in the FMEA table editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Diagram' }).first().click();
  await page.getByPlaceholder('e.g. Pump System Reliability').fill('FMEA undo');
  await page.locator('select').first().selectOption({ label: 'FMEA' });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/projects\/.+\/diagrams\/.+/);

  await page.getByRole('button', { name: 'Add Row' }).click();
  await expect(page.locator('table input').first()).toBeVisible();

  // Focus sits on the Add Row button (not a cell), so Ctrl+Z hits the store.
  await page.keyboard.press('Control+z');
  await expect(page.locator('table input')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('table input').first()).toBeVisible();

  // Edit-menu Undo reverts a typed cell value as one step.
  await page.locator('table input').first().fill('Pump seal wear');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByText('Undo', { exact: true }).click();
  await expect(page.locator('table input').first()).toHaveValue('');
});

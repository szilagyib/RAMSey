import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Guest mode is a first-class flow: everything runs client-side (localStorage)
// without an account. Nothing touches the server DB, so no cleanup is needed.
test('guest: create a local diagram, add a node, persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  await test.step('create a diagram without an account', async () => {
    await createDiagram(page, 'Guest Local Diagram');
  });

  await test.step('drop a node and see it on the canvas', async () => {
    await dropNode(page, 'operational');
    await expect(page.locator('.react-flow').getByText('S0')).toBeVisible();
  });

  await test.step('save, then the local diagram survives a reload', async () => {
    // Guest mode has no autosave (no Yjs); persist explicitly first.
    await page.keyboard.press('Control+s');
    await page.reload();
    // Generous timeout: after a reload the lazy editor chunk may ride out a
    // dev-server re-serve under full-suite load.
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.react-flow').getByText('S0')).toBeVisible();
  });
});

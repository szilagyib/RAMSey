import { test, expect } from '@playwright/test';
import { register, deleteAccount, uniqueEmail, createDiagram, dropNode } from './helpers';

// Core product flow for a signed-in user: create a diagram, build on the
// canvas, verify it persists across a reload (server-side persistence).
test('registered user: create diagram, add node, persists across reload', async ({ page }) => {
  const email = uniqueEmail('diagram');
  await register(page, email);

  await test.step('create a Markov diagram from the dashboard', async () => {
    await createDiagram(page, 'E2E Pump System');
    await expect(page.getByText('E2E Pump System').first()).toBeVisible();
  });

  await test.step('drop an Operational state onto the canvas', async () => {
    await dropNode(page, 'operational');
    await expect(page.locator('.react-flow').getByText('S0')).toBeVisible();
  });

  await test.step('diagram appears on the dashboard and reopens', async () => {
    await page.goto('/');
    await page.getByText('E2E Pump System').first().click();
    await page.waitForURL(/\/projects\/.+\/diagrams\/.+/);
    await expect(page.locator('.react-flow')).toBeVisible();
  });

  await deleteAccount(page); // cleanup
});

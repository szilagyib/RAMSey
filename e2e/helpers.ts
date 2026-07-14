import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const TEST_PASSWORD = 'e2e-password-123';

/** Unique per-run email so parallel runs / reruns never collide. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.invalid`;
}

/** Register a fresh account; lands on the dashboard. */
export async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('Confirm password').fill(TEST_PASSWORD);
  await page.getByRole('checkbox', { name: /Privacy Policy/i }).check();
  await page.getByRole('button', { name: /create account|sign up|register/i }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
}

/**
 * Delete the signed-in account via the Account page (also serves as cleanup so
 * E2E users don't accumulate in the dev DB).
 */
export async function deleteAccount(page: Page): Promise<void> {
  await page.goto('/account');
  // Generous timeout: the first hit on a lazy route may ride out a one-time
  // Vite dependency-optimization reload in dev.
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForURL(/\/login/);
}

/**
 * Create a diagram from the dashboard form (creates a project + diagram and
 * navigates into the editor).
 *
 * `typeLabel` picks the diagram type (e.g. 'Fault Tree'); it defaults to Markov.
 * Importing a file of a different type than the diagram is refused by design, so
 * a test that imports one must create the matching type here.
 */
export async function createDiagram(
  page: Page,
  name: string,
  typeLabel?: string,
): Promise<void> {
  await page.getByRole('button', { name: 'New Diagram' }).first().click();
  await page.getByPlaceholder('e.g. Pump System Reliability').fill(name);
  if (typeLabel) {
    await page.locator('select').first().selectOption({ label: typeLabel });
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/projects\/.+\/diagrams\/.+/);
  await expect(page.locator('.react-flow')).toBeVisible();
}

/**
 * Drop a node from the sidebar palette onto the React Flow canvas by
 * dispatching a drop event carrying the app's drag payload.
 */
export async function dropNode(page: Page, subType: string): Promise<void> {
  const dataTransfer = await page.evaluateHandle((t) => {
    const dt = new DataTransfer();
    dt.setData('application/ramsey-node-subtype', t);
    return dt;
  }, subType);
  await page.dispatchEvent('.react-flow', 'drop', {
    dataTransfer,
    clientX: 500,
    clientY: 300,
  });
}

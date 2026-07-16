import { test, expect } from '@playwright/test';
import { confirmPendingRegistration, uniqueEmail, TEST_PASSWORD } from './helpers';

// Signing up requires agreeing to the Privacy Policy.
test('registration is blocked until the consent box is ticked', async ({ page }) => {
  const email = uniqueEmail('consent');
  await page.goto('/register');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('Confirm password').fill(TEST_PASSWORD);

  const consent = page.getByRole('checkbox', { name: /Privacy Policy/i });
  await expect(consent).not.toBeChecked();

  // Submitting without it must not create an account: we stay on /register.
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/register/);

  // The policy is readable before you agree to it.
  const link = page.getByRole('link', { name: 'Privacy Policy' });
  await expect(link).toHaveAttribute('href', '/privacy');

  // Tick it, and registration goes through.
  await consent.check();
  await page.getByRole('button', { name: /create account/i }).click();
  await confirmPendingRegistration(page, email);

  // Clean up the account this test created.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await page.waitForURL(/\/login/);
});

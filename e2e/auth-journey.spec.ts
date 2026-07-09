import { test, expect } from '@playwright/test';
import { register, deleteAccount, uniqueEmail, TEST_PASSWORD } from './helpers';

// Full account lifecycle against the real stack: register → logout → login →
// delete account → the deleted credentials no longer work. Deletion doubles
// as cleanup, so the dev DB doesn't accumulate E2E users.
test('account lifecycle: register, logout, login, delete', async ({ page }) => {
  const email = uniqueEmail('lifecycle');

  await test.step('register lands on the dashboard', async () => {
    await register(page, email);
  });

  await test.step('logout redirects to the login page', async () => {
    await page.getByTitle('Sign out').click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  await test.step('login works with the registered credentials', async () => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/');
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  });

  await test.step('account deletion signs out and lands on /login', async () => {
    await deleteAccount(page);
  });

  await test.step('deleted credentials are rejected', async () => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // The api client maps all 401s to a generic 'Unauthorized' message; the
    // key behavior is that login FAILS and we stay on /login.
    await expect(page.getByText(/unauthorized|invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test('privacy policy is reachable from the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
});

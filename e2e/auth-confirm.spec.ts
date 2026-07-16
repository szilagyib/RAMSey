import { test, expect } from '@playwright/test';
import {
  confirmPendingRegistration,
  deleteAccount,
  lastConfirmationCode,
  uniqueEmail,
  TEST_PASSWORD,
} from './helpers';

test('registration waits for the emailed code and supports pasting all six digits', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('confirm');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('Confirm password').fill(TEST_PASSWORD);
  await page.getByRole('checkbox', { name: /Privacy Policy/i }).check();
  await page.getByRole('button', { name: /create account/i }).click();

  await page.waitForURL(/\/verify-email/);
  expect((await context.cookies()).some((cookie) => cookie.name === 'ramsey_token')).toBe(false);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in \d+s/ })).toBeDisabled();

  const code = await lastConfirmationCode(page, email);
  await page.getByLabel('Digit 1').evaluate((element, pastedCode) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', pastedCode);
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  }, code);

  for (let index = 0; index < code.length; index += 1) {
    await expect(page.getByLabel(`Digit ${index + 1}`)).toHaveValue(code[index]);
  }

  await page.getByRole('button', { name: 'Confirm email' }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();

  await deleteAccount(page);
});

test('login sends an unverified account back through confirmation', async ({ page }) => {
  const email = uniqueEmail('login-pending');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel('Confirm password').fill(TEST_PASSWORD);
  await page.getByRole('checkbox', { name: /Privacy Policy/i }).check();
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL(/\/verify-email/);

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/\/verify-email/);
  await expect(page.getByText(email)).toBeVisible();
  await confirmPendingRegistration(page, email);
  await deleteAccount(page);
});

import { test, expect } from '@playwright/test';
import { register, deleteAccount, uniqueEmail } from './helpers';

/**
 * Team-owned projects. The backend already supported them (Project.ownerType)
 * and only ever let team *admins* create one — but the dashboard hardcoded the
 * owner to the signed-in user, so there was no way to make one.
 */
test('create a diagram under a team, and find it in that team’s section', async ({ page }) => {
  await register(page, uniqueEmail('team-owner'));

  // A team's slug is globally unique, so a fixed name would collide with the
  // team left behind by the previous run of this test.
  const teamName = `Reliability ${Date.now()}`;

  // Create a team. Whoever creates it is its admin.
  await page.goto('/teams');
  await page.getByPlaceholder('Team name').fill(teamName);
  await page.getByRole('button', { name: /create team/i }).click();
  await expect(page.getByText(teamName).first()).toBeVisible();

  // The dashboard now offers that team as an owner.
  await page.goto('/');
  await page.getByRole('button', { name: 'New Diagram' }).first().click();
  await page.getByPlaceholder('e.g. Pump System Reliability').fill('Shared pump study');

  const owner = page.getByLabel('Owner');
  await expect(owner).toBeVisible();
  await expect(owner.locator('option')).toHaveText(['Personal', teamName]);

  await owner.selectOption({ label: teamName });
  await expect(page.getByText(/Everyone on this team can open and edit it/i)).toBeVisible();

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/projects\/.+\/diagrams\/.+/);

  // Back on the dashboard it sits under its team, not under "My Diagrams".
  await page.goto('/');
  const teamGroup = page.getByRole('button', { name: new RegExp(teamName) });
  await expect(teamGroup).toBeVisible();
  await expect(teamGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Shared pump study' })).toBeVisible();

  // The group folds, and stays folded across a reload.
  await teamGroup.click();
  await expect(teamGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Shared pump study' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: new RegExp(teamName) })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await deleteAccount(page);
});

test('a user with no teams sees no owner picker at all', async ({ page }) => {
  await register(page, uniqueEmail('team-none'));

  await page.getByRole('button', { name: 'New Diagram' }).first().click();
  await page.getByPlaceholder('e.g. Pump System Reliability').fill('Just mine');

  // Nothing to choose between, so nothing is asked.
  await expect(page.getByLabel('Owner')).toHaveCount(0);

  await deleteAccount(page);
});

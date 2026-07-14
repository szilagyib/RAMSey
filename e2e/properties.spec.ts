import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// The property panel reflects over a node's data. Left raw, that showed
// `stateType` as a free-text box — where a typo silently produces a state the
// solver reads as something else. Meaningful fields are now typed.
test('state type is a dropdown, and changing it redraws the node', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Properties');
  await dropNode(page, 'operational');

  const canvas = page.locator('.react-flow');
  const node = page.locator('.react-flow__node').first();
  await node.click();

  const sidebar = page.locator('aside').last();
  const stateType = sidebar.locator('select').first();

  // Spelled out in English, with exactly the four legal values.
  await expect(sidebar.getByText('State type')).toBeVisible();
  await expect(stateType.locator('option')).toHaveText([
    'Operational',
    'Degraded',
    'Failed',
    'Absorbing',
  ]);

  // Absorbing states are drawn with the double ring, so the canvas must change.
  await stateType.selectOption('absorbing');
  await expect(stateType).toHaveValue('absorbing');

  // Undo reverts it in one entry. (Undo restores the diagram from a snapshot,
  // which clears the selection, so re-select to read the panel back.)
  await page.keyboard.press('Control+z');
  await node.click();
  await expect(sidebar.locator('select').first()).toHaveValue('operational');
  await expect(canvas).toBeVisible();
});

test('nodeKind is shown but cannot be retyped', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Properties readonly', 'Fault Tree');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/fault-tree-cooling-loss.json');
  await expect(page.locator('.react-flow').getByText('AND1')).toBeVisible();

  await page.locator('.react-flow__node').first().click();
  const sidebar = page.locator('aside').last();

  // Present and legible...
  await expect(sidebar.getByText('Kind', { exact: true })).toBeVisible();
  // ...but not an input: changing which component draws the node isn't a text edit.
  await expect(sidebar.locator('input[value="event"]')).toHaveCount(0);
  await expect(sidebar.locator('input[value="gate"]')).toHaveCount(0);

  // Gate/event type, on the other hand, IS a dropdown — same component, new symbol.
  await page.locator('.react-flow__node').filter({ hasText: 'AND1' }).click();
  await expect(sidebar.getByText('Gate type')).toBeVisible();
});

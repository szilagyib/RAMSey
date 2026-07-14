import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Opacity is applied to the node wrapper, so it works for every node type —
// including the SVG ones (gates, events) that don't render from a div style.
// It lives on node.data, so export/import and collab carry it for free; that
// the diagram persists at all is guest-diagram.spec.ts's job, not this one's.
test('a node can be faded back, and undo restores it in one step', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Opacity');
  await dropNode(page, 'operational');

  const node = page.locator('.react-flow__node').first();
  const opacityOf = () => node.evaluate((el) => getComputedStyle(el).opacity);

  await expect.poll(opacityOf).toBe('1');

  await node.click();
  const sidebar = page.locator('aside').last();
  const slider = sidebar.getByLabel('Opacity', { exact: true });
  await expect(slider).toBeVisible();

  await slider.fill('40');
  await expect.poll(opacityOf).toBe('0.4');
  await expect(sidebar.getByText('40%')).toBeVisible();

  // One undo entry, not one per slider step.
  await page.keyboard.press('Control+z');
  await expect.poll(opacityOf).toBe('1');

  // Redo brings it back.
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(opacityOf).toBe('0.4');
});

test('opacity works on an SVG node too (a fault-tree gate)', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Opacity gate', 'Fault Tree');
  await dropNode(page, 'and_gate');

  const gate = page.locator('.react-flow__node').first();
  await gate.click();

  await page.locator('aside').last().getByLabel('Opacity', { exact: true }).fill('30');
  await expect.poll(() => gate.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.3');
});

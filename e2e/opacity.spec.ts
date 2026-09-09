import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Opacity fades the node's FILL, not the node. Fading the whole element took the
// border, the label and the handles with it, so a faded node became unreadable
// and hard to grab — "make this one recede" means shade the fill and keep the
// outline crisp. The two node families get there differently: div bodies mix
// their background toward transparent, SVG shapes use fill-opacity. Both are
// checked, because the wrapper-opacity approach used to cover both by accident.
// It lives on node.data, so export/import and collab carry it for free; that the
// diagram persists at all is guest-diagram.spec.ts's job, not this one's.

/**
 * Alpha of an element's computed background colour (1 when fully opaque).
 *
 * Chromium resolves the `color-mix(... , transparent)` the fill uses to a
 * `color(srgb r g b / a)` value, not `rgba()`, so both forms are read.
 */
const backgroundAlpha = (el: Element) => {
  const bg = getComputedStyle(el).backgroundColor;
  const slash = bg.match(/\/\s*([\d.]+)\s*\)/);
  if (slash) return parseFloat(slash[1]);
  const rgba = bg.match(/^rgba\(([^)]+)\)$/);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => parseFloat(p.trim()));
    return parts.length > 3 ? parts[3] : 1;
  }
  return 1;
};

test('a node can be faded back, and undo restores it in one step', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Opacity');
  await dropNode(page, 'operational');

  const node = page.locator('.react-flow__node').first();
  // The circle body itself, not the ring wrapper around it: the inner div is
  // the element carrying the fill.
  const body = node.locator('div.rounded-full.border-2').first();
  const fillAlpha = () => body.evaluate(backgroundAlpha);
  const wrapperOpacity = () => node.evaluate((el) => getComputedStyle(el).opacity);

  await expect.poll(fillAlpha).toBe(1);

  await node.click();
  const sidebar = page.locator('aside').last();
  const slider = sidebar.getByLabel('Opacity', { exact: true });
  await expect(slider).toBeVisible();

  await slider.fill('40');
  await expect.poll(fillAlpha).toBeCloseTo(0.4, 2);
  await expect(sidebar.getByText('40%')).toBeVisible();
  // The node itself never fades: that is the whole point of the fill-only rule.
  expect(await wrapperOpacity()).toBe('1');

  // One undo entry, not one per slider step.
  await page.keyboard.press('Control+z');
  await expect.poll(fillAlpha).toBe(1);

  // Redo brings it back.
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(fillAlpha).toBeCloseTo(0.4, 2);
});

test('opacity works on an SVG node too (a fault-tree gate)', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Opacity gate', 'Fault Tree');
  await dropNode(page, 'and_gate');

  const gate = page.locator('.react-flow__node').first();
  await gate.click();

  await page.locator('aside').last().getByLabel('Opacity', { exact: true }).fill('30');

  // An SVG shape cannot mix a CSS background; it fades via fill-opacity, which
  // applies to the fill by definition and leaves the stroke and label alone.
  // fill-opacity is set on the wrapper and inherited by the shapes beneath it.
  const shape = gate.locator('svg path').first();
  await expect
    .poll(() => shape.evaluate((el) => Number(getComputedStyle(el).fillOpacity)))
    .toBeCloseTo(0.3, 2);
  expect(await gate.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

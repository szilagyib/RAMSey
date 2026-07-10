import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// Drawing-app edge shaping: select an edge → a control handle appears → drag
// it to bend the edge → double-click resets to automatic routing.
test('edge control point bends and resets an edge', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Edge shaping');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-redundant-power.json');
  await expect(page.locator('.react-flow').getByText('β')).toBeVisible();

  // Select the β edge (the only unshaped one). Click at 35% along the path —
  // the label chip sits at the midpoint and would swallow the click.
  const edge = page.locator('.react-flow__edge').last();
  const clickPoint = await edge.evaluate((el) => {
    const path = el.querySelector('path');
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() * 0.35);
    const m = path.getScreenCTM();
    if (!m) return null;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  expect(clickPoint).not.toBeNull();
  await page.mouse.click(clickPoint!.x, clickPoint!.y);

  const handle = page.locator('.edge-cp');
  await expect(handle).toBeVisible();

  const before = await edge.locator('path').first().getAttribute('d');

  // Drag the handle down-right to bend the edge.
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60, box!.y + 80, { steps: 8 });
  await page.mouse.up();

  const bent = await edge.locator('path').first().getAttribute('d');
  expect(bent).not.toBe(before);
  expect(bent).toContain('Q'); // now a quadratic through the control point

  // Double-click the handle → back to automatic routing.
  await handle.dblclick();
  const reset = await edge.locator('path').first().getAttribute('d');
  expect(reset).not.toContain('Q');
});

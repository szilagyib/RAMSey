import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Recoloring through the property panel: independent Fill / Border / Text on
// nodes and Color on edges, with undo integration.
test('recolor node fill / border / text from the property panel', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Recolor');
  await dropNode(page, 'operational');

  const node = page.locator('.react-flow__node').first();
  await node.click();
  await expect(page.getByText('Node Properties')).toBeVisible();

  // The Markov state body is the inner rounded-full div (the first div child
  // is a connection handle).
  const body = node.locator('div.rounded-full').last();

  await test.step('Border swatch colors the outline', async () => {
    await page.getByLabel('Set Border #ef4444').click();
    await expect(body).toHaveCSS('border-color', 'rgb(239, 68, 68)');
  });

  await test.step('Fill swatch colors the interior independently', async () => {
    await page.getByLabel('Set Fill #0ea5e9').click();
    await expect(body).toHaveCSS('background-color', 'rgb(14, 165, 233)');
    // Border stays what we set — the two channels are independent.
    await expect(body).toHaveCSS('border-color', 'rgb(239, 68, 68)');
  });

  await test.step('Text swatch colors the label', async () => {
    await page.getByLabel('Set Text #6366f1').click();
    await expect(body.locator('span')).toHaveCSS('color', 'rgb(99, 102, 241)');
  });

  await test.step('undo reverts the last channel only', async () => {
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await page.keyboard.press('Control+z'); // undo Text
    await node.click();
    const bodyAgain = node.locator('div.rounded-full').last();
    // Text back to default, but fill + border remain.
    await expect(bodyAgain).toHaveCSS('background-color', 'rgb(14, 165, 233)');
  });
});

test('recolor an edge stroke from the property panel', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Edge recolor');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page.locator('input[type="file"]').setInputFiles('examples/markov-redundant-power.json');
  await expect(page.locator('.react-flow').getByText('β')).toBeVisible();

  // Select the β edge (last), then color it.
  const edge = page.locator('.react-flow__edge').last();
  const pt = await edge.evaluate((el) => {
    const path = el.querySelector('path')!;
    const p = path.getPointAtLength(path.getTotalLength() * 0.35);
    const m = path.getScreenCTM()!;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByText('Edge Properties')).toBeVisible();

  await page.getByLabel('Set Color #a855f7').click();
  await expect(edge.locator('path.react-flow__edge-path')).toHaveCSS('stroke', 'rgb(168, 85, 247)');
});

import { test, expect, type Page } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

/** Flow-coordinate positions (not screen) of every node, in id order. */
async function positions(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__node')]
      .map((el) => {
        const t = (el as HTMLElement).style.transform; // translate(Xpx, Ypx)
        const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(t);
        return {
          id: el.getAttribute('data-id') ?? '',
          x: m ? parseFloat(m[1]) : NaN,
          y: m ? parseFloat(m[2]) : NaN,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

test('align, distribute, nudge and minimap', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Align');

  // Three nodes at deliberately ragged positions.
  await dropNode(page, 'operational', 380, 220);
  await dropNode(page, 'degraded', 560, 320);
  await dropNode(page, 'failed', 740, 260);
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(3);

  // Rubber-band select all three.
  await page.keyboard.press('Control+a');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(3);

  await test.step('align middle puts them on one horizontal line', async () => {
    await page.getByTitle('Align middle (horizontal row)').click();
    const p = await positions(page);
    // Same size nodes → equal y after centering.
    expect(p[0].y).toBeCloseTo(p[1].y, 1);
    expect(p[1].y).toBeCloseTo(p[2].y, 1);
  });

  await test.step('distribute horizontally evens the gaps', async () => {
    await page.getByTitle('Distribute horizontally').click();
    const p = (await positions(page)).sort((a, b) => a.x - b.x);
    const gap1 = p[1].x - p[0].x;
    const gap2 = p[2].x - p[1].x;
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1);
  });

  await test.step('arrow key nudges the selection', async () => {
    const before = await positions(page);
    await page.locator('.react-flow__pane').focus();
    await page.keyboard.press('ArrowRight');
    const after = await positions(page);
    expect(after[0].x).toBeCloseTo(before[0].x + 16, 1);
    expect(after[1].x).toBeCloseTo(before[1].x + 16, 1);
  });

  await test.step('undo reverts the whole alignment step', async () => {
    await page.keyboard.press('Control+z'); // undo nudge
    await page.keyboard.press('Control+z'); // undo distribute
    const p = (await positions(page)).sort((a, b) => a.x - b.x);
    const gap1 = p[1].x - p[0].x;
    const gap2 = p[2].x - p[1].x;
    expect(Math.abs(gap1 - gap2)).toBeGreaterThan(1); // ragged again
  });

  await test.step('minimap toggles on and persists', async () => {
    await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
    await page.getByTitle('Show minimap').click();
    await expect(page.locator('.react-flow__minimap')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
  });
});

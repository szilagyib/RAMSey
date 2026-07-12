import { test, expect, type Page } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

async function nodePositions(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__node')].map((el) => {
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
      return { x: m ? parseFloat(m[1]) : NaN, y: m ? parseFloat(m[2]) : NaN };
    }),
  );
}

// Alignment guides: dragging a node close to another's axis snaps it and shows
// the guide line.
test('dragging near another node snaps and shows a guide', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Guides');
  await dropNode(page, 'operational', 400, 240);
  await dropNode(page, 'failed', 640, 400);
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);

  const before = await nodePositions(page);

  // Drag node 2 so its x lands a few px from node 1's x (within snap range).
  const target = nodes.nth(1);
  const box = (await target.boundingBox())!;
  const first = (await nodes.nth(0).boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Aim at node 1's x + 4px, keeping y well below it.
  await page.mouse.move(first.x + box.width / 2 + 4, startY, { steps: 12 });

  // A guide line renders mid-drag.
  await expect(page.locator('.react-flow__viewport-portal div').first()).toBeVisible();

  await page.mouse.up();

  const after = await nodePositions(page);
  const w = box.width;

  // It snapped: the dragged node's x now sits exactly on one of the alignment
  // lines node 1 offers (left / center / right, matched against the dragged
  // node's own left / center / right).
  const lines = [
    after[0].x, // left ↔ left
    after[0].x + w / 2, // left ↔ center
    after[0].x + w, // left ↔ right
    after[0].x - w / 2, // center ↔ left
    after[0].x - w, // right ↔ left
  ];
  const onALine = lines.some((l) => Math.abs(after[1].x - l) < 1);
  expect(onALine).toBe(true);

  // …and it actually moved (the drag wasn't a no-op).
  expect(Math.abs(after[1].x - before[1].x)).toBeGreaterThan(1);

  // Guides disappear once the drag ends.
  await expect(page.locator('.react-flow__viewport-portal div')).toHaveCount(0);
});

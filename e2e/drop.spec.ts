import { test, expect, type Page } from '@playwright/test';
import { createDiagram } from './helpers';

/**
 * Dropping used to subtract the pane's offset twice — once by hand, once inside
 * screenToFlowPosition — so every node landed offset by the palette's width and
 * the toolbar's height. And the cursor carried a snapshot of the sidebar row,
 * which said nothing about the node's real footprint.
 *
 * A node must now land centred on the point you dropped it, at the size its
 * preview showed.
 */

/** Drop a palette item on the canvas at a point in the page's coordinates. */
async function dropAt(page: Page, subType: string, size: { width: number; height: number }, clientX: number, clientY: number) {
  const dataTransfer = await page.evaluateHandle(
    ({ t, s }) => {
      const dt = new DataTransfer();
      dt.setData('application/ramsey-node-subtype', t);
      dt.setData('application/ramsey-node-size', s);
      return dt;
    },
    { t: subType, s: `${size.width}x${size.height}` },
  );
  await page.dispatchEvent('.react-flow', 'drop', { dataTransfer, clientX, clientY });
}

/** The size the palette advertises for an item, read off its drag-preview ghost. */
async function ghostSize(page: Page, index: number) {
  const ghost = page.locator('aside').first().locator('div[aria-hidden="true"][style*="width"]').nth(index);
  const box = await ghost.evaluate((el) => ({
    width: (el as HTMLElement).offsetWidth,
    height: (el as HTMLElement).offsetHeight,
  }));
  return box;
}

/** Convert a page point into flow coordinates via the live viewport transform. */
async function toFlow(page: Page, clientX: number, clientY: number) {
  return page.evaluate(
    ({ x, y }) => {
      const pane = document.querySelector('.react-flow') as HTMLElement;
      const vp = document.querySelector('.react-flow__viewport') as HTMLElement;
      const rect = pane.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(vp).transform);
      return { x: (x - rect.left - m.e) / m.a, y: (y - rect.top - m.f) / m.d };
    },
    { x: clientX, y: clientY },
  );
}

/** The node's own position, straight off its transform (already in flow units). */
async function nodeBox(page: Page) {
  return page.locator('.react-flow__node').first().evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const h = el as HTMLElement;
    return { x: m.e, y: m.f, width: h.offsetWidth, height: h.offsetHeight };
  });
}

test('a Markov state lands centred on the cursor, at its preview size', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Drop markov');

  const advertised = await ghostSize(page, 0); // 'Operational'
  const pane = (await page.locator('.react-flow').boundingBox())!;
  const clientX = pane.x + 430;
  const clientY = pane.y + 270;

  const expected = await toFlow(page, clientX, clientY);
  await dropAt(page, 'operational', advertised, clientX, clientY);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  const node = await nodeBox(page);

  // The preview told the truth about the node's footprint.
  expect(node.width).toBe(advertised.width);
  expect(node.height).toBe(advertised.height);

  // And the node's centre is the point we dropped on.
  expect(node.x + node.width / 2).toBeCloseTo(expected.x, 0);
  expect(node.y + node.height / 2).toBeCloseTo(expected.y, 0);
});

test('an oblong fault-tree event also lands centred — not offset by the palette', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Drop FTA', 'Fault Tree');

  // 'Intermediate' is 128x48: wide and flat, so a mistake in either axis shows.
  const items = page.locator('aside').first().locator('div[draggable="true"]');
  const index = (await items.allInnerTexts()).findIndex((t) => t.includes('Intermediate'));
  expect(index).toBeGreaterThan(-1);

  const advertised = await ghostSize(page, index);
  expect(advertised.width).toBeGreaterThan(advertised.height);

  const pane = (await page.locator('.react-flow').boundingBox())!;
  const clientX = pane.x + 520;
  const clientY = pane.y + 320;

  const expected = await toFlow(page, clientX, clientY);
  await dropAt(page, 'intermediate_event', advertised, clientX, clientY);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  const node = await nodeBox(page);
  expect(node.width).toBe(advertised.width);
  expect(node.height).toBe(advertised.height);
  expect(node.x + node.width / 2).toBeCloseTo(expected.x, 0);
  expect(node.y + node.height / 2).toBeCloseTo(expected.y, 0);
});

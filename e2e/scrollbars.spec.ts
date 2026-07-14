import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// React Flow gives no hint that a diagram runs off the edge, and no way to get
// there but guessing which way to drag. These are ordinary scrollbars.
test('scrollbars appear once there is a diagram, and dragging one pans the canvas', async ({
  page,
}) => {
  await page.goto('/');
  await createDiagram(page, 'Scrollbars');

  const horizontal = page.getByRole('scrollbar', { name: 'Scroll canvas horizontally' });
  const vertical = page.getByRole('scrollbar', { name: 'Scroll canvas vertically' });

  // An empty canvas has nothing to scroll to, so it gets no chrome.
  await expect(horizontal).toHaveCount(0);
  await expect(vertical).toHaveCount(0);

  await dropNode(page, 'operational');
  await expect(horizontal).toBeVisible();
  await expect(vertical).toBeVisible();

  const viewportTransform = () =>
    page.locator('.react-flow__viewport').evaluate((el) => getComputedStyle(el).transform);

  const before = await viewportTransform();

  // Drag the horizontal thumb to the right; the canvas must pan.
  const thumb = (await horizontal.boundingBox())!;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(thumb.x + thumb.width / 2 + 90, thumb.y + thumb.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(viewportTransform).not.toBe(before);
});

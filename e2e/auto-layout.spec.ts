import { test, expect } from '@playwright/test';
import { createDiagram, dropNode } from './helpers';

// Auto Layout dynamically imports elkjs (~1.4 MB, lazy). Guard that the
// on-demand load works and the layout actually repositions nodes.
test('auto layout loads elk on demand and repositions nodes', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Auto layout');

  // Two connected nodes dropped at the same-ish spot.
  await dropNode(page, 'operational', 500, 300);
  await dropNode(page, 'failed', 520, 320);
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);

  const posBefore = await nodes.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).style.transform),
  );

  // Toolbar auto-layout button (LayoutGrid icon, title "Auto Layout").
  await page.getByTitle('Auto Layout').click();

  // elk downloads + lays out asynchronously; wait for positions to change.
  await expect(async () => {
    const posAfter = await nodes.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.transform),
    );
    expect(posAfter).not.toEqual(posBefore);
  }).toPass({ timeout: 15_000 });

  // Still two nodes, still on canvas.
  await expect(nodes).toHaveCount(2);
});

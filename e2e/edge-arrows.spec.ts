import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// Regression: arrowheads came from React Flow's `defaultEdgeOptions`, which
// only reaches edges created by dragging a connection. Edges that were loaded
// from the DB, imported, pasted or auto-laid-out carried no markerEnd and
// rendered with no arrow. The marker now belongs to the edge component, so it
// cannot go missing — and it inherits the edge's stroke via context-stroke, so
// it matches selected / recoloured / success-failure edges.
test('imported directed edges render an arrowhead that follows the stroke', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Edge arrows');

  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-redundant-power.json');
  await expect(page.locator('.react-flow').getByText('β')).toBeVisible();

  const paths = page.locator('.react-flow__edge-path');
  await expect.poll(() => paths.count()).toBeGreaterThan(2);

  // Every imported transition has an arrowhead (this was empty before the fix).
  const markers = await paths.evaluateAll((els) => els.map((el) => el.getAttribute('marker-end')));
  expect(markers.every((m) => !!m && m.includes('ramsey-arrow'))).toBe(true);

  // The head takes its colour from the path that references it, so it never
  // goes stale-grey against a coloured or selected edge.
  await expect(page.locator('#ramsey-arrow path')).toHaveAttribute('fill', 'context-stroke');

  // ...and no head is painted *under* its target node. A repair rate (μ) runs
  // right-to-left into a target handle on the node's left, so its curve used to
  // reach the handle from inside the circle and the head vanished beneath the
  // node body. The curve is now trimmed at the rim.
  const buried = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((n) => {
      const el = n as HTMLElement;
      const t = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;
      return { id: el.dataset.id, x: +t[1], y: +t[2], w: el.offsetWidth, h: el.offsetHeight };
    });
    return [...document.querySelectorAll('path.react-flow__edge-path')]
      .map((p) => {
        const path = p as SVGPathElement;
        const len = path.getTotalLength();
        // Where the arrowhead's body sits: back along the tangent from the tip.
        const body = path.getPointAtLength(Math.max(0, len - 10));
        const under = nodes.find(
          (n) =>
            body.x > n.x + 2 &&
            body.x < n.x + n.w - 2 &&
            body.y > n.y + 2 &&
            body.y < n.y + n.h - 2,
        );
        return under ? `${(p.parentElement as SVGGElement).dataset.id} under ${under.id}` : null;
      })
      .filter(Boolean);
  });
  expect(buried).toEqual([]);
});

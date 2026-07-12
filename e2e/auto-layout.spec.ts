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

// Regression: after auto-layout, a bidirectional pair (λ one way, μ back) used
// to collapse onto the same straight line — one edge and its rate label hidden.
test('auto layout keeps bidirectional edges and their labels visible', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Layout pairs');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page.locator('input[type="file"]').setInputFiles('examples/markov-redundant-power.json');
  const canvas = page.locator('.react-flow');
  await expect(canvas.getByText('β')).toBeVisible();

  await page.getByTitle('Auto Layout').click();
  await page.waitForTimeout(1500);

  // Every rate label still renders (2λ and λ would be hidden under the μ chips
  // if the pairs overlapped).
  for (const label of ['2λ', 'λ', 'β']) {
    await expect(canvas.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(canvas.getByText('μ', { exact: true })).toHaveCount(2);

  // The two directions of the OK<->DEG pair take different paths.
  const paths = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((e) => e.getAttribute('d')));
  expect(new Set(paths).size).toBe(paths.length);
});

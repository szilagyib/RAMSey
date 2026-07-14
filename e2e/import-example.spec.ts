import { test, expect } from '@playwright/test';
import { createDiagram } from './helpers';

// The shipped examples must load through the real UI: File → Import JSON…
test('example Markov file imports and renders', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Import target'); // guest markov diagram (empty)

  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-redundant-power.json');

  // All four states render, including the absorbing blackout state.
  const canvas = page.locator('.react-flow');
  for (const label of ['OK', 'DEG', 'BAT', 'OUT']) {
    await expect(canvas.getByText(label, { exact: true })).toBeVisible();
  }
  // Transition rate labels render too.
  await expect(canvas.getByText('2λ')).toBeVisible();
  await expect(canvas.getByText('β')).toBeVisible();

  await page.screenshot({ path: 'test-results/visual/example-import.png' });
});

// The 2oo3 example is the repairable counterpart to the one above: no absorbing
// state, so steady-state availability and MTBF/MTTR actually converge.
test('2oo3 pump station example imports and analyses in the sidebar', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page, 'Pump station');

  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page
    .locator('input[type="file"]')
    .setInputFiles('examples/markov-2oo3-pump-station.json');

  const canvas = page.locator('.react-flow');
  for (const label of ['OK', 'S2', 'S1', 'S0', 'PM', 'CCF', 'SPUR']) {
    await expect(canvas.getByText(label, { exact: true })).toBeVisible();
  }
  // The mechanisms that make this one worth shipping: common cause, proof test.
  await expect(canvas.getByText('βλ')).toBeVisible();
  await expect(canvas.getByText('λ_PT')).toBeVisible();

  await page.screenshot({ path: 'test-results/visual/example-2oo3.png' });

  // It solves, and — being irreducible — without the absorbing-state warning
  // that the redundant-power example raises on steady-state methods.
  const sidebar = page.locator('aside').last();
  await page.getByRole('button', { name: 'Analysis', exact: true }).first().click();
  await page.getByText('Run Analysis...').click();
  await sidebar.getByRole('button', { name: 'Run analysis' }).click();

  await expect(sidebar.getByText('availability', { exact: true })).toBeVisible();
  await expect(sidebar.getByText(/absorbing states/i)).toHaveCount(0);
});

// The other three notations of the same cooling system. Each must import into a
// diagram of its own type (the app refuses a mismatch) and render every node —
// an example whose nodes overlap is an example that can't be clicked.
const CROSS_NOTATION = [
  {
    file: 'fault-tree-cooling-loss.json',
    type: 'Fault Tree',
    labels: ['No cooling flow on demand', 'Both trains unavailable', 'AND1', '2oo3'],
  },
  {
    file: 'rbd-cooling-water.json',
    type: 'Reliability Block Diagram',
    labels: ['IN', 'PMP-A', 'XTIE', 'HX-B', 'OUT'],
  },
  {
    file: 'event-tree-cooling-loss.json',
    type: 'Event Tree',
    labels: ['Loss of main cooling water', 'Standby pump starts', 'Plant trip'],
  },
  {
    file: 'bow-tie-cooling-loss.json',
    type: 'Bow-Tie',
    labels: ['Pump seal failure', 'Vibration monitoring', 'Loss of cooling water flow'],
  },
];

for (const { file, type, labels } of CROSS_NOTATION) {
  test(`${file} imports, renders, and every node is clickable`, async ({ page }) => {
    await page.goto('/');
    await createDiagram(page, file, type);

    await page.getByRole('button', { name: 'File' }).click();
    await page.getByText('Import JSON...').click();
    await page.locator('input[type="file"]').setInputFiles(`examples/${file}`);

    const canvas = page.locator('.react-flow');
    for (const label of labels) {
      await expect(canvas.getByText(label, { exact: true })).toBeVisible();
    }

    // No node may be buried under another: click each one. Playwright fails on
    // an intercepted click, which is exactly how the fault tree's overlapping
    // intermediate events were caught.
    const nodes = canvas.locator('.react-flow__node');
    const count = await nodes.count();
    for (let i = 0; i < count; i++) {
      await nodes.nth(i).click({ timeout: 5000 });
    }

    await page.screenshot({ path: `test-results/visual/example-${file}.png` });
  });
}

import { test, type Page } from '@playwright/test';

// Visual review utility (not a regression test): builds each diagram type in
// guest mode and screenshots light + dark to test-results/visual/.
// Skipped by default; run with:  VISUAL_PROBE=1 npx playwright test visual-probe
test.skip(!process.env.VISUAL_PROBE, 'visual review utility — set VISUAL_PROBE=1 to run');

async function createDiagram(page: Page, name: string, typeLabel?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Diagram' }).first().click();
  await page.getByPlaceholder('e.g. Pump System Reliability').fill(name);
  if (typeLabel) {
    const select = page.locator('select').first();
    await select.selectOption({ label: typeLabel });
  }
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(/\/projects\/.+\/diagrams\/.+/);
  await page.locator('.react-flow').waitFor();
  await page.waitForTimeout(400);
}

async function drop(page: Page, subType: string, x: number, y: number) {
  const dt = await page.evaluateHandle((t) => {
    const d = new DataTransfer();
    d.setData('application/ramsey-node-subtype', t);
    return d;
  }, subType);
  await page.dispatchEvent('.react-flow', 'drop', { dataTransfer: dt, clientX: x, clientY: y });
  await page.waitForTimeout(150);
}

/** Drag-connect from a source handle to a target handle. */
async function connect(
  page: Page,
  srcNode: number,
  srcHandle: string,
  tgtNode: number,
  tgtHandle: string,
) {
  const src = await page
    .locator('.react-flow__node')
    .nth(srcNode)
    .locator(srcHandle)
    .boundingBox();
  const tgt = await page
    .locator('.react-flow__node')
    .nth(tgtNode)
    .locator(tgtHandle)
    .boundingBox();
  if (!src || !tgt) return;
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

async function shoot(page: Page, name: string) {
  await page.locator('.react-flow').screenshot({ path: `test-results/visual/${name}-light.png` });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(200);
  await page.locator('.react-flow').screenshot({ path: `test-results/visual/${name}-dark.png` });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  // Let transition-colors settle before any follow-up capture.
  await page.waitForTimeout(400);
}

test('fault tree symbols', async ({ page }) => {
  await createDiagram(page, 'V-FTA', 'Fault Tree');
  await drop(page, 'top_event', 640, 200);
  await drop(page, 'and_gate', 400, 320);
  await drop(page, 'or_gate', 560, 320);
  await drop(page, 'xor_gate', 720, 320);
  await drop(page, 'k_of_n_gate', 880, 320);
  await drop(page, 'not_gate', 1020, 320);
  await drop(page, 'basic_event', 420, 480);
  await drop(page, 'intermediate_event', 600, 480);
  await drop(page, 'undeveloped_event', 800, 480);
  // Wire TE0 -> AND1 -> BE6/IE7 so the orthogonal tree connectors render.
  // Node order: 0=TE0 1=AND 2=OR 3=XOR 4=K/N 5=NOT 6=BE 7=IE 8=UE
  await connect(page, 0, '.react-flow__handle-bottom', 1, '.react-flow__handle-top');
  await connect(page, 1, '.react-flow__handle-bottom', 6, '.react-flow__handle-top');
  await connect(page, 1, '.react-flow__handle-bottom', 7, '.react-flow__handle-top');
  await shoot(page, 'fta');
  // Full editor (incl. sidebar palette) in BOTH themes for chrome review.
  await page.screenshot({ path: 'test-results/visual/fta-editor-full.png' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/visual/fta-editor-full-dark.png' });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
});

test('markov symbols with transition', async ({ page }) => {
  await createDiagram(page, 'V-Markov'); // markov is the default type
  await drop(page, 'operational', 420, 300);
  await drop(page, 'degraded', 640, 300);
  await drop(page, 'failed', 860, 300);
  await drop(page, 'absorbing', 640, 460);
  // Connect S0 -> S1 by dragging from the source handle to the target handle.
  const s0 = page.locator('.react-flow__node').first();
  const s1 = page.locator('.react-flow__node').nth(1);
  const src = await s0.locator('.react-flow__handle-right').boundingBox();
  const tgt = await s1.locator('.react-flow__handle-left').boundingBox();
  if (src && tgt) {
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  await shoot(page, 'markov');
});

test('rbd symbols', async ({ page }) => {
  await createDiagram(page, 'V-RBD', 'Reliability Block Diagram');
  await drop(page, 'input_terminal', 380, 320);
  await drop(page, 'block', 580, 320);
  await drop(page, 'block', 780, 320);
  await drop(page, 'output_terminal', 980, 320);
  await shoot(page, 'rbd');
});

test('event tree symbols', async ({ page }) => {
  await createDiagram(page, 'V-ETA', 'Event Tree');
  await drop(page, 'initiating_event', 380, 340);
  await drop(page, 'header', 620, 340);
  await drop(page, 'consequence', 880, 260);
  await drop(page, 'consequence', 880, 420);
  // Branches: IE -> header, then success (top handle) / failure (bottom).
  await connect(page, 0, '.react-flow__handle-right', 1, '.react-flow__handle-left');
  await connect(page, 1, '[data-handleid="success"]', 2, '.react-flow__handle-left');
  await connect(page, 1, '[data-handleid="failure"]', 3, '.react-flow__handle-left');
  await shoot(page, 'eta');
});

test('bow-tie symbols', async ({ page }) => {
  await createDiagram(page, 'V-BT', 'Bow-Tie');
  await drop(page, 'threat', 340, 320);
  await drop(page, 'preventive_barrier', 520, 320);
  await drop(page, 'top_event', 680, 320);
  await drop(page, 'mitigative_barrier', 840, 320);
  await drop(page, 'consequence', 1000, 320);
  // Full hazard pathway so the directed flow edges render.
  await connect(page, 0, '.react-flow__handle-right', 1, '.react-flow__handle-left');
  await connect(page, 1, '.react-flow__handle-right', 2, '.react-flow__handle-left');
  await connect(page, 2, '.react-flow__handle-right', 3, '.react-flow__handle-left');
  await connect(page, 3, '.react-flow__handle-right', 4, '.react-flow__handle-left');
  await shoot(page, 'bowtie');
});

test('rbd wired', async ({ page }) => {
  await createDiagram(page, 'V-RBD2', 'Reliability Block Diagram');
  await drop(page, 'input_terminal', 380, 320);
  await drop(page, 'block', 580, 320);
  await drop(page, 'output_terminal', 980, 320);
  await connect(page, 0, '.react-flow__handle-right', 1, '.react-flow__handle-left');
  await connect(page, 1, '.react-flow__handle-right', 2, '.react-flow__handle-left');
  await shoot(page, 'rbd-wired');
});

test('imported example in both themes', async ({ page }) => {
  await createDiagram(page, 'V-Import'); // markov default
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByText('Import JSON...').click();
  await page.locator('input[type="file"]').setInputFiles('examples/markov-redundant-power.json');
  await page.waitForTimeout(400);
  await shoot(page, 'example');
});

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Node } from '@xyflow/react';
import { generateLatex } from '../../src/lib/tikz';
import { sanitizeId } from '../../src/lib/tikz/latex';
import { PX_PER_CM } from '../../src/lib/tikz/coords';
import { getDiagramTypeConfig } from '../../src/diagram-types/registry';

// ---------------------------------------------------------------------------
// The LaTeX export, compiled.
//
// Every export defect this suite has seen was invisible to a string assertion:
// the emitted TikZ was well-formed and wrong. A raw Greek λ aborted the build
// outright, so nothing came out at all; boxes sized themselves to their text and
// printed over their neighbours; nodes anchored on their corner instead of their
// centre, so a fault tree's gates no longer lined up under the events they
// belong to. You only see any of that by running LaTeX and looking at where
// things landed.
//
// So these tests compile the real output and measure it. TikZ is asked to report
// each node's bounding box (`\typeout`), which is exact and needs no PDF
// parsing or font metrics — the picture tells us where it put things.
//
// Needs pdflatex on PATH. Without it the suite skips rather than fails: a
// missing toolchain is not a broken export. `npm run test:latex` runs it.
// ---------------------------------------------------------------------------

const hasPdflatex = spawnSync('pdflatex', ['--version'], { encoding: 'utf8' }).status === 0;

/** TeX points per cm — TikZ reports coordinates in pt. */
const PT_PER_CM = 28.4527;

/**
 * How far a node may sit from where the canvas puts it, in cm.
 *
 * The exporter writes coordinates to 2 decimal places to keep the .tex
 * readable, which is worth up to 0.005cm per coordinate and so 0.01cm when two
 * are compared. 0.02cm leaves room for that and is still about half a point on
 * the page — far below anything a reader could see, and twenty times finer than
 * the 0.45cm skew that corner-anchoring used to produce.
 */
const PLACEMENT_TOLERANCE_CM = 0.02;

/**
 * Node sizes come from the sidebar registry, which is where the app itself
 * gets them, and which e2e/drop.spec.ts re-measures against the real components
 * so it cannot drift from what a user sees.
 */
const SUBTYPE_OF: Record<string, (data: Record<string, string>) => string> = {
  markov_chain: (d) => d.stateType,
  fault_tree: (d) =>
    d.nodeKind === 'gate' ? `${d.gateType.toLowerCase()}_gate` : `${d.eventType}_event`,
  reliability_block_diagram: (d) => d.nodeKind,
  event_tree: (d) => d.nodeKind,
  bow_tie: (d) => d.nodeKind,
};

function measuredNodes(type: string, raw: Node[]): Node[] {
  const config = getDiagramTypeConfig(type);
  const sizes = new Map(config!.sidebarItems.map((i) => [i.type, i.size]));
  const subtypeOf = SUBTYPE_OF[type];

  return raw.map((n) => {
    const subType = subtypeOf(n.data as Record<string, string>);
    const size = sizes.get(subType);
    // Loud rather than silent: an unmapped kind would fall back to a default
    // box and quietly test a layout no user ever sees.
    if (!size) throw new Error(`${type}: no registry size for '${subType}'`);
    return { ...n, measured: size };
  });
}

interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Ask the picture where it put each node.
 *
 * A rotated shape reports its corners rotated with it, so `south west` is not
 * reliably the smaller corner — the values are sorted rather than trusted.
 */
function withProbes(tex: string, ids: string[]): string {
  const probes = ids
    .map(
      (id) =>
        `  \\path let \\p1=(${id}.south west), \\p2=(${id}.north east) in ` +
        `\\pgfextra{\\typeout{RAMSEYBOX ${id} \\x1 \\y1 \\x2 \\y2}};\n` +
        // Where the node was actually placed. A rotated shape's bounding-box
        // centre is not its centre anchor, so placement is judged from this and
        // only the extent comes from the corners.
        `  \\path let \\p1=(${id}.center) in ` +
        `\\pgfextra{\\typeout{RAMSEYCENTRE ${id} \\x1 \\y1}};`,
    )
    .join('\n');
  const end = tex.lastIndexOf('\\end{tikzpicture}');
  return tex.slice(0, end) + probes + '\n' + tex.slice(end);
}

/** Where each node was placed, in cm, keyed by TikZ node name. */
function parseCentres(log: string): Map<string, { x: number; y: number }> {
  const centres = new Map<string, { x: number; y: number }>();
  for (const line of log.split('\n')) {
    const m = /^RAMSEYCENTRE (\S+) (-?[\d.]+)pt (-?[\d.]+)pt/.exec(line);
    if (m) centres.set(m[1], { x: +m[2] / PT_PER_CM, y: +m[3] / PT_PER_CM });
  }
  return centres;
}

function parseBoxes(log: string): Box[] {
  const boxes: Box[] = [];
  for (const line of log.split('\n')) {
    const m = /^RAMSEYBOX (\S+) (-?[\d.]+)pt (-?[\d.]+)pt (-?[\d.]+)pt (-?[\d.]+)pt/.exec(line);
    if (!m) continue;
    const [x1, y1, x2, y2] = [+m[2], +m[3], +m[4], +m[5]];
    boxes.push({
      id: m[1],
      left: Math.min(x1, x2),
      right: Math.max(x1, x2),
      bottom: Math.min(y1, y2),
      top: Math.max(y1, y2),
    });
  }
  return boxes;
}

/** Compile a document and return its log; throws with the LaTeX error if it fails. */
function compile(tex: string, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ramsey-latex-'));
  const file = join(dir, `${name}.tex`);
  writeFileSync(file, tex, 'utf8');

  // The file is named relative to cwd, never by absolute path: TeX treats `~`
  // as an active character, and a Windows temp dir is full of them
  // (C:\Users\SZILAG~1.BOR\...), which makes it lose the filename entirely.
  const run = spawnSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], {
    cwd: dir,
    encoding: 'utf8',
  });
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  if (run.status !== 0 || !existsSync(join(dir, `${name}.pdf`))) {
    const reason = log.split('\n').find((l) => l.startsWith('!')) ?? 'no error line in log';
    throw new Error(`${name} did not compile: ${reason}`);
  }
  return log;
}

const EXAMPLES: [string, string][] = [
  ['markov-redundant-power.json', 'markov_chain'],
  ['markov-2oo3-pump-station.json', 'markov_chain'],
  ['fault-tree-cooling-loss.json', 'fault_tree'],
  ['rbd-cooling-water.json', 'reliability_block_diagram'],
  ['event-tree-cooling-loss.json', 'event_tree'],
  ['bow-tie-cooling-loss.json', 'bow_tie'],
];

function loadExample(file: string) {
  const path = resolve(__dirname, '../../../../examples', file);
  return JSON.parse(readFileSync(path, 'utf8')) as { type: string; nodes: Node[]; edges: [] };
}

describe.skipIf(!hasPdflatex)('the LaTeX export compiles and lands where the diagram says', () => {
  for (const [file, type] of EXAMPLES) {
    describe(file, () => {
      const doc = loadExample(file);
      const nodes = measuredNodes(type, doc.nodes);
      const tex = generateLatex(type, nodes, doc.edges);
      const name = file.replace('.json', '');

      // Shapes, plus the captions the exporter draws as nodes of their own — a
      // gate's name beside it, a barrier's underneath. Those are exactly the
      // pieces that used to collide, so they have to be measured too. They are
      // found in the output rather than predicted, so a new one is covered the
      // day it is written.
      const nodeIds = nodes.map((n) => sanitizeId(n.id));
      const labelIds = [...tex.matchAll(/\((n[A-Za-z0-9_]+_label)\)/g)].map((m) => m[1]);
      const ids = [...nodeIds, ...labelIds];

      // Compiled once per example: pdflatex is the slow part.
      const log = compile(withProbes(tex, ids), name);
      const boxes = parseBoxes(log);
      const centres = parseCentres(log);

      /**
       * Where the canvas puts a node's anchor point, in px.
       *
       * A fault-tree node stacks a fixed 48px symbol above its caption, so the
       * symbol centre — not the box centre — is what lines up on screen and what
       * the exporter targets. Every other notation draws one box and centres on
       * it.
       */
      const canvasAnchor = (n: Node) => {
        const size = (n as { measured: { width: number; height: number } }).measured;
        return {
          x: n.position.x + size.width / 2,
          y: n.position.y + (type === 'fault_tree' ? 24 : size.height / 2),
        };
      };

      it('compiles to a PDF', () => {
        // compile() throws on failure, so reaching here is the assertion; this
        // also proves every node actually made it into the picture.
        expect(boxes).toHaveLength(ids.length);
        expect(centres.size).toBe(ids.length);
      });

      // The export writes explicit coordinates precisely so the page keeps the
      // arrangement the user built. Anchoring on a node's top-left corner
      // instead of its centre broke that: it displaced every node by half its
      // own size, which is invisible while all the nodes match and a 0.45cm
      // skew as soon as they differ — a fault-tree gate no longer sat under the
      // event it belongs to.
      it('places every node where the canvas puts it', () => {
        const first = nodes[0];
        const firstAnchor = canvasAnchor(first);
        const firstPage = centres.get(sanitizeId(first.id))!;

        for (const n of nodes.slice(1)) {
          const anchor = canvasAnchor(n);
          const page = centres.get(sanitizeId(n.id))!;

          // Offsets from one node, so the comparison is independent of where
          // the origin ended up. TikZ is y-up and the canvas y-down.
          expect(
            Math.abs(page.x - firstPage.x - (anchor.x - firstAnchor.x) / PX_PER_CM),
            `${n.id} sits ${anchor.x - firstAnchor.x}px right of ${first.id} on the canvas`,
          ).toBeLessThan(PLACEMENT_TOLERANCE_CM);
          expect(
            Math.abs(page.y - firstPage.y + (anchor.y - firstAnchor.y) / PX_PER_CM),
            `${n.id} sits ${anchor.y - firstAnchor.y}px below ${first.id} on the canvas`,
          ).toBeLessThan(PLACEMENT_TOLERANCE_CM);
        }
      });

      // A node drawn over its neighbour is the failure this export kept
      // producing: a circle grown to fit "Pump A fails" swallowed the one beside
      // it, and a description box stretched to one line printed across the node
      // next to it. Both compiled perfectly.
      it('draws no node on top of another', () => {
        const overlaps: string[] = [];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            // A hair of tolerance so shapes that merely touch are not flagged.
            const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const dy = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
            if (dx > 0.5 && dy > 0.5) {
              overlaps.push(`${a.id} over ${b.id} (${dx.toFixed(1)}x${dy.toFixed(1)}pt)`);
            }
          }
        }
        expect(overlaps).toEqual([]);
      });
    });
  }
});

// The two paths the example loop above cannot reach: FMEA exports a booktabs
// table rather than a picture, and a diagram can legitimately be empty.
describe.skipIf(!hasPdflatex)('LaTeX export of the non-diagram paths', () => {
  it('compiles an FMEA table, metacharacters and all', () => {
    const rows = [
      {
        id: 'r1',
        item: 'Pump & seal',
        function: 'Move 100% of flow',
        failureMode: 'Seizure_2',
        effect: 'No flow (0 m^3/h)',
        severity: 8,
        occurrence: 3,
        detection: 4,
        rpn: 96,
        actions: 'Inspect ~monthly',
      },
    ];
    expect(() => compile(generateLatex('fmea', [], [], rows), 'fmea')).not.toThrow();
  });

  it('compiles an empty diagram', () => {
    expect(() => compile(generateLatex('markov_chain', [], []), 'empty')).not.toThrow();
  });
});

describe.skipIf(!hasPdflatex)('LaTeX export of user-supplied text', () => {
  const base = loadExample('markov-redundant-power.json');

  /** The shipped example with its state labels replaced. */
  const withLabels = (labels: string[]) => {
    const nodes = measuredNodes('markov_chain', base.nodes).map((n, i) => ({
      ...n,
      data: { ...(n.data as object), label: labels[i % labels.length] },
    }));
    return generateLatex('markov_chain', nodes as Node[], base.edges);
  };

  // Greek is how rates and states are written in this field, and a raw λ used to
  // abort the build with "Unicode character λ (U+03BB)" — no document at all.
  it('compiles Greek and maths symbols', () => {
    expect(() => compile(withLabels(['λ', 'μ_1', 'β·λ', 'Σ ≥ 2']), 'greek')).not.toThrow();
  });

  // A label is free text, so every LaTeX metacharacter has to survive it.
  it('compiles LaTeX metacharacters in a label', () => {
    expect(() =>
      compile(withLabels(['100% & rising', 'a_b^c', '#1 {x}', '$5 ~ \\bad']), 'meta'),
    ).not.toThrow();
  });
});

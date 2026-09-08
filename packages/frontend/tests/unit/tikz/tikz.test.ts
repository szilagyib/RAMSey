import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { escapeLatex, mathWrap, sanitizeId } from '../../../src/lib/tikz/latex';
import { makeTransform, coord } from '../../../src/lib/tikz/coords';
import { wrapDocument } from '../../../src/lib/tikz/document';
import { markovToTikz } from '../../../src/lib/tikz/markov';
import { faultTreeToTikz } from '../../../src/lib/tikz/faultTree';
import { eventTreeToTikz } from '../../../src/lib/tikz/eventTree';
import { rbdToTikz } from '../../../src/lib/tikz/rbd';
import { bowTieToTikz } from '../../../src/lib/tikz/bowTie';
import { fmeaToTable } from '../../../src/lib/tikz/fmea';
import { generateLatex } from '../../../src/lib/tikz';
import type { FMEARow } from '../../../src/types/diagram';

function node(id: string, x: number, y: number, data: Record<string, unknown>): Node {
  return { id, type: 't', position: { x, y }, data } as Node;
}
/** A node React Flow has measured, which is what the exporters actually see. */
function sized(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {},
): Node {
  return { id, type: 't', position: { x, y }, data, measured: { width, height } } as Node;
}
function edge(
  id: string,
  source: string,
  target: string,
  data: Record<string, unknown> = {},
): Edge {
  return { id, source, target, data } as Edge;
}

describe('escapeLatex', () => {
  it('escapes LaTeX special characters', () => {
    expect(escapeLatex('a_b')).toBe('a\\_b');
    expect(escapeLatex('100%')).toBe('100\\%');
    expect(escapeLatex('A&B')).toBe('A\\&B');
    expect(escapeLatex('$x$')).toBe('\\$x\\$');
    expect(escapeLatex('#1')).toBe('\\#1');
    expect(escapeLatex('{x}')).toBe('\\{x\\}');
    expect(escapeLatex('a~b')).toBe('a\\textasciitilde{}b');
    expect(escapeLatex('a^b')).toBe('a\\textasciicircum{}b');
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b');
  });

  it('returns empty string for empty input', () => {
    expect(escapeLatex('')).toBe('');
  });

  // Greek is how rates are written in this field, and the palette offers it —
  // the shipped Markov example labels its transitions 2λ, μ and β. pdfLaTeX
  // cannot typeset a raw Unicode λ, so the whole document failed to compile
  // with 'Unicode character λ (U+03BB)'. Not a cosmetic issue: nothing came
  // out at all.
  it('renders Greek letters as math rather than raw Unicode', () => {
    expect(escapeLatex('2λ')).toBe('2$\\lambda$');
    expect(escapeLatex('μ')).toBe('$\\mu$');
    expect(escapeLatex('β')).toBe('$\\beta$');
    expect(escapeLatex('Σ')).toBe('$\\Sigma$');
  });

  it('renders common math symbols too', () => {
    expect(escapeLatex('a ≤ b')).toBe('a $\\leq$ b');
    expect(escapeLatex('3 × 4')).toBe('3 $\\times$ 4');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLatex('Pump A fails')).toBe('Pump A fails');
  });
});

describe('mathWrap', () => {
  // Already inside math mode, so a Greek letter takes its command bare —
  // wrapping it again would close and reopen the math for no reason.
  it('renders Greek as a bare command inside the math it wraps', () => {
    expect(mathWrap('λ_1')).toBe('$\\lambda_1$');
    expect(mathWrap('0.001')).toBe('$0.001$');
  });
});

describe('sanitizeId', () => {
  it('produces a TikZ-safe node name', () => {
    expect(sanitizeId('state-1')).toBe('nstate_1');
    expect(sanitizeId('ft-node-2')).toBe('nft_node_2');
  });
});

describe('coords', () => {
  it('normalizes to the bounding box and flips Y', () => {
    const nodes = [sized('a', 80, 0, 0, 0), sized('b', 160, 160, 0, 0)];
    const tf = makeTransform(nodes);
    expect(tf(nodes[0])).toEqual({ x: 0, y: 0 });
    expect(tf(nodes[1])).toEqual({ x: 1, y: -2 });
  });

  it('formats coordinates', () => {
    expect(coord({ x: 1.5, y: -2.25 })).toBe('(1.5,-2.25)');
  });

  // React Flow's `position` is a node's top-left corner, but TikZ centres a
  // node on the coordinate given to `at`. Anchoring on the corner therefore
  // displaces every node by half its own size — uniform and invisible when all
  // nodes match (a Markov chain), but a per-node skew as soon as they differ.
  describe('anchoring', () => {
    it('anchors a node by its centre, not its top-left corner', () => {
      const wide = sized('wide', 0, 0, 160, 80);
      const tf = makeTransform([wide]);
      // Centre is 80px right and 40px down of the corner: 1cm and -0.5cm.
      expect(tf(wide)).toEqual({ x: 1, y: -0.5 });
    });

    // The fault-tree bug: a 128px description box above a 48px gate, both
    // centred on the same vertical line. On corner anchoring they came out
    // 0.5cm apart, so no gate lined up with its parent or its children.
    it('aligns nodes of different widths that share a centre line', () => {
      const box = sized('box', 36, 0, 128, 48); // centre x = 100
      const gate = sized('gate', 76, 120, 48, 64); // centre x = 100
      const tf = makeTransform([box, gate]);
      expect(tf(gate).x).toBe(tf(box).x);
    });

    // A fault-tree symbol sits at the TOP of its node box with the caption
    // below, so the box centre is lower than the symbol centre.
    it('anchors on the symbol when a caption sits below it', () => {
      const event = sized('e', 0, 0, 48, 65); // 48px circle + ~17px caption
      const tf = makeTransform([event]);
      expect(tf(event, 48).y).toBe(-0.3); // symbol centre, 24px
      expect(tf(event).y).toBe(-0.41); // box centre, 32.5px
    });

    // Export runs from a rendered canvas, so this is a fallback rather than a
    // normal path — but it must not be zero, which would put the node back on
    // its corner. 48px is the default box the diagram store assumes too.
    it('assumes the default node box when nothing measured it', () => {
      const bare = node('bare', 80, 80, {});
      const tf = makeTransform([bare]);
      expect(tf(bare)).toEqual({ x: 0.3, y: -0.3 });
    });
  });
});

describe('wrapDocument', () => {
  it('wraps TikZ bodies in a compilable standalone document', () => {
    const out = wrapDocument('BODY', { tikz: true });
    expect(out).toContain('\\documentclass[border=10pt]{standalone}');
    expect(out).toContain('\\usepackage{tikz}');
    expect(out).toContain('\\usetikzlibrary{');
    expect(out).toContain('shapes.gates.logic.US');
    expect(out).toContain('\\begin{document}\nBODY\n\\end{document}');
  });

  it('loads extra packages', () => {
    expect(wrapDocument('B', { packages: ['booktabs'] })).toContain('\\usepackage{booktabs}');
  });
});

describe('markovToTikz', () => {
  const nodes = [
    node('state-0', 0, 0, { label: 'S_0', stateType: 'operational', isInitial: true }),
    node('state-1', 160, 0, { label: 'Failed', stateType: 'absorbing', isInitial: false }),
  ];
  const edges = [
    edge('t0', 'state-0', 'state-1', { rate: '\\lambda_1', label: '', probability: '' }),
    edge('t1', 'state-1', 'state-0', { rate: '$\\mu_1$', label: '', probability: '' }),
  ];
  const out = markovToTikz(nodes, edges);

  it('emits one tikzpicture with styled state nodes', () => {
    expect(out).toContain('\\begin{tikzpicture}');
    expect(out).toContain('\\end{tikzpicture}');
    expect(out).toContain('fill=green!20'); // operational
    expect(out).toContain('double,'); // absorbing
    expect(out).toContain('{S\\_0}'); // escaped label
  });

  it('draws an initial-state arrow and reciprocal bent edges', () => {
    expect(out).toContain('($(nstate_0)+(-1.2,0)$) -- (nstate_0)');
    expect(out).toContain('to[bend left=15]'); // reciprocal pair
  });

  it('renders rates as math (no double-escaping, surrounding $ stripped)', () => {
    expect(out).toContain('{$\\lambda_1$}'); // bare rate wrapped in math
    expect(out).toContain('{$\\mu_1$}'); // user-supplied $...$ not doubled
  });
});

describe('faultTreeToTikz', () => {
  // The whole point of exporting coordinates instead of letting a LaTeX tree
  // package lay the diagram out: the user arranged it, and a fault tree can
  // share a basic event between two gates, which is a DAG no tree package can
  // express without duplicating it.
  describe('alignment', () => {
    const box = sized('top', 36, 0, 128, 48, {
      label: 'Top',
      nodeKind: 'event',
      eventType: 'top',
    });
    const gate = sized('g1', 76, 120, 48, 64, {
      label: 'G1',
      nodeKind: 'gate',
      gateType: 'AND',
    });
    const out = faultTreeToTikz([box, gate], [edge('e', 'top', 'g1')]);

    /** The x coordinate the node is placed at, as written in the output. */
    const xOf = (id: string) => {
      const marker = `(${id}) at (`;
      const line = out.split('\n').find((l) => l.includes(marker));
      return line?.split(marker)[1].split(',')[0];
    };

    it('puts a gate and its parent box on the same vertical line', () => {
      expect(xOf('ntop')).toBe('0.8'); // both centres are at canvas x=100
      expect(xOf('ng1')).toBe(xOf('ntop'));
    });

    // A symbol's caption sits BELOW it on the canvas. Put it inside the TikZ
    // node instead and the text dictates the shape: `minimum size=0.9cm` is a
    // floor, not a cap, so a basic event labelled 'Pump A fails' rendered as a
    // circle wide enough to hold that sentence, swallowing its neighbours.
    it('captions a basic event below the circle, leaving the circle its own size', () => {
      const ev = sized('b1', 0, 0, 48, 65, {
        label: 'Pump A fails',
        nodeKind: 'event',
        eventType: 'basic',
      });
      const line = faultTreeToTikz([ev], [])
        .split('\n')
        .find((l) => l.includes('(nb1)'))!;
      expect(line).toContain('Pump A fails');
      // Wrapped to the caption width the canvas gives it, so neighbouring
      // captions cannot run into each other.
      expect(line).toContain('below:');
      expect(line).toContain('text width=');
      expect(line).toMatch(/\{\}\s*;\s*$/); // empty body, so the shape keeps its size
    });

    // A description box wraps its text on the canvas (a fixed-width box, two
    // lines); in TikZ it stretched to one long line and ran into its siblings.
    it('wraps a description box instead of stretching it', () => {
      const ev = sized('t1', 0, 0, 128, 48, {
        label: 'No cooling flow on demand',
        nodeKind: 'event',
        eventType: 'top',
      });
      expect(faultTreeToTikz([ev], [])).toContain('text width=');
    });

    // The gate label used to be planted 0.75cm straight below the gate, which
    // in a top-down tree is exactly where the edge to its children runs.
    it('keeps the gate label clear of the edge dropping to its children', () => {
      expect(out).not.toContain('+(0,-0.75)');
    });
  });

  it('uses logic-gate shapes and event shapes', () => {
    const nodes = [
      node('g1', 0, 0, { label: 'G1', nodeKind: 'gate', gateType: 'AND' }),
      node('e1', 0, 100, { label: 'E1', nodeKind: 'event', eventType: 'basic' }),
      node('k1', 200, 0, { label: 'K1', nodeKind: 'gate', gateType: 'K_OF_N', k: 2 }),
    ];
    const out = faultTreeToTikz(nodes, [edge('x', 'g1', 'e1')]);
    expect(out).toContain('and gate US');
    expect(out).toContain('circle, draw'); // basic event
    expect(out).toContain('$\\geq 2$'); // k-of-n
    expect(out).toContain('(ng1) -- (ne1)');
  });
});

describe('eventTreeToTikz', () => {
  // `minimum width` is a floor, not a cap, so a box grew to fit its label on one
  // line: "Loss of main cooling water" stretched to ~4.5cm and printed over the
  // node beside it. The canvas wraps inside a fixed-width box, so the export
  // does too — same fix as the fault-tree description boxes.
  it('wraps a long label instead of stretching the box', () => {
    const nodes = [
      sized('ie1', 60, 300, 128, 48, {
        label: 'Loss of main cooling water',
        nodeKind: 'initiating_event',
      }),
      sized('h1', 340, 300, 128, 48, { label: 'Standby pump starts', nodeKind: 'header' }),
    ];
    const out = eventTreeToTikz(nodes, []);

    for (const line of out.split('\n').filter((l) => l.includes('\\node'))) {
      expect(line).toContain('text width=');
    }
  });

  it('styles nodes and labels branches', () => {
    const nodes = [
      node('ie1', 0, 0, { label: 'IE', nodeKind: 'initiating_event' }),
      node('c1', 200, 0, { label: 'OK', nodeKind: 'consequence' }),
    ];
    const out = eventTreeToTikz(nodes, [
      edge('b1', 'ie1', 'c1', { branchType: 'success', probability: '0.9', label: '' }),
    ]);
    expect(out).toContain('fill=orange!20'); // initiating
    expect(out).toContain('fill=green!15'); // consequence
    expect(out).toContain('success 0.9');
  });
});

describe('rbdToTikz', () => {
  it('renders blocks and terminals', () => {
    const nodes = [
      node('in', 0, 0, { label: 'IN', nodeKind: 'input_terminal' }),
      node('b1', 100, 0, { label: 'B1', nodeKind: 'block' }),
    ];
    const out = rbdToTikz(nodes, [edge('e', 'in', 'b1')]);
    expect(out).toContain('label=below:{IN}'); // terminal
    expect(out).toContain('rectangle, draw, fill=blue!15'); // block
    expect(out).toContain('(nin) -- (nb1)');
  });
});

describe('bowTieToTikz', () => {
  // A barrier's name used to be rotated onto the bar itself, unbounded, so a
  // 20-character name ran ~0.85cm past each end of a 1.1cm bar and collided
  // with the barriers above and below. It sits below the bar now, wrapped: the
  // bar stays the thin bar the notation calls for, and the name is readable
  // without crossing the arrows that run through it.
  describe('barrier labels', () => {
    const nodes = [
      sized('b1', 280, 120, 32, 80, {
        label: 'Vibration monitoring',
        nodeKind: 'preventive_barrier',
      }),
    ];
    const labelLine = () =>
      bowTieToTikz(nodes, [])
        .split('\n')
        .find((l) => l.includes('Vibration monitoring'))!;

    it('sits below the bar rather than on it', () => {
      expect(labelLine()).toContain('anchor=north');
      expect(labelLine()).not.toContain('rotate=90');
    });

    // The shipped example spaces barriers 180px (2.25cm) apart vertically, so
    // an unbounded label is what ran into its neighbours.
    it('wraps instead of running into the next barrier', () => {
      expect(labelLine()).toContain('text width=');
    });

    it('leaves the bar itself empty', () => {
      const bar = bowTieToTikz(nodes, [])
        .split('\n')
        .find((l) => l.includes('(nb1) at'))!;
      expect(bar).toMatch(/\{\}\s*;\s*$/);
    });
  });

  it('renders barrier bars and maps amber to orange', () => {
    const nodes = [
      node('te', 100, 0, { label: 'Top', nodeKind: 'top_event' }),
      node('pb', 50, 0, { label: 'Bar', nodeKind: 'preventive_barrier' }),
    ];
    const out = bowTieToTikz(nodes, []);
    expect(out).toContain('fill=orange!30'); // amber -> orange
    expect(out).toContain('minimum width=0.45cm'); // barrier bar
    expect(out).not.toContain('amber');
  });
});

describe('fmeaToTable', () => {
  it('renders a booktabs table with all columns', () => {
    const rows: FMEARow[] = [
      {
        id: 'r1',
        item: 'Pump',
        function: 'Move fluid',
        failureMode: 'Seizure',
        effect: 'No flow',
        severity: 8,
        occurrence: 3,
        detection: 4,
        rpn: 96,
        actions: 'Inspect',
      },
    ];
    const out = fmeaToTable(rows);
    expect(out).toContain('\\begin{tabular}');
    expect(out).toContain('\\toprule');
    expect(out).toContain('Failure Mode');
    expect(out).toContain('Pump & Move fluid & Seizure & No flow & 8 & 3 & 4 & 96 & Inspect \\\\');
    expect(out).toContain('\\bottomrule');
  });
});

describe('generateLatex', () => {
  it('dispatches graph types to TikZ', () => {
    const out = generateLatex(
      'markov_chain',
      [node('s', 0, 0, { label: 'S', stateType: 'operational', isInitial: false })],
      [],
    );
    expect(out).toContain('\\documentclass[border=10pt]{standalone}');
    expect(out).toContain('\\begin{tikzpicture}');
  });

  it('dispatches FMEA to a table', () => {
    const out = generateLatex('fmea', [], [], []);
    expect(out).toContain('\\usepackage{booktabs}');
    expect(out).toContain('\\begin{tabular}');
  });

  it('throws for an unsupported type', () => {
    expect(() => generateLatex('nope', [], [])).toThrow(/not supported/);
  });
});

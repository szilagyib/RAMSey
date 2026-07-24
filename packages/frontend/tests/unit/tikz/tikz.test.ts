import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { escapeLatex, sanitizeId } from '../../../src/lib/tikz/latex';
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
});

describe('sanitizeId', () => {
  it('produces a TikZ-safe node name', () => {
    expect(sanitizeId('state-1')).toBe('nstate_1');
    expect(sanitizeId('ft-node-2')).toBe('nft_node_2');
  });
});

describe('coords', () => {
  it('normalizes to the bounding box and flips Y', () => {
    const nodes = [node('a', 80, 0, {}), node('b', 160, 160, {})];
    const tf = makeTransform(nodes);
    expect(tf({ x: 80, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(tf({ x: 160, y: 160 })).toEqual({ x: 1, y: -2 });
  });

  it('formats coordinates', () => {
    expect(coord({ x: 1.5, y: -2.25 })).toBe('(1.5,-2.25)');
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

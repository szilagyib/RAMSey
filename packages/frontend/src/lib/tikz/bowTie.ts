import type { Node, Edge } from '@xyflow/react';
import type { BowTieNodeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';

const NODE_STYLE: Record<BowTieNodeData['nodeKind'], string> = {
  threat: 'rectangle, draw, fill=red!15, minimum width=1.6cm, minimum height=0.7cm',
  // Barriers render as thin vertical bars.
  preventive_barrier: 'rectangle, draw, fill=blue!20, minimum width=0.45cm, minimum height=1.1cm',
  top_event: 'diamond, draw, fill=amber!30, aspect=1.4, inner sep=2pt',
  mitigative_barrier: 'rectangle, draw, fill=green!20, minimum width=0.45cm, minimum height=1.1cm',
  consequence: 'rectangle, draw, fill=purple!15, minimum width=1.6cm, minimum height=0.7cm',
};

// `amber` is not a stock LaTeX color; map the top event to orange.
const COLOR_FIX = (s: string) => s.replace('amber', 'orange');

export function bowTieToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = [
    '\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]',
  ];

  for (const n of nodes) {
    const d = n.data as BowTieNodeData;
    const p = tf(n.position);
    // Barriers are bars (no inner text); other kinds carry their label.
    const isBarrier = d.nodeKind === 'preventive_barrier' || d.nodeKind === 'mitigative_barrier';
    const id = sanitizeId(n.id);
    const text = isBarrier ? '' : escapeLatex(d.label);
    lines.push(`  \\node[${COLOR_FIX(NODE_STYLE[d.nodeKind])}] (${id}) at ${coord(p)} {${text}};`);
    if (isBarrier && d.label) {
      lines.push(`  \\node[font=\\scriptsize, rotate=90] at (${id}) {${escapeLatex(d.label)}};`);
    }
  }

  for (const e of edges) {
    lines.push(`  \\draw[->] (${sanitizeId(e.source)}) -- (${sanitizeId(e.target)});`);
  }

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

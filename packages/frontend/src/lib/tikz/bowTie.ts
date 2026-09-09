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

/**
 * Width a barrier's label wraps at, in cm.
 *
 * The name used to be rotated onto the bar itself with no width bound at all,
 * so "Vibration monitoring" ran about 0.85cm past each end of a 1.1cm bar and
 * collided with the barriers above and below. The canvas gets away with the
 * rotated form because it clips (`overflow-hidden`); clipping drops words from
 * a report, so the export wraps.
 *
 * Wrapping in place would only trade one overflow for another — three lines of
 * rotated text are far wider than a 0.45cm bar, and they sit where the arrows
 * run. So the label goes below the bar, which leaves the bar the thin bar the
 * notation asks for and gives the name room to be read.
 *
 * 1.9cm comes from the diagram rather than taste: barriers in the shipped
 * example sit 180px apart vertically, which is 2.25cm.
 */
const BARRIER_LABEL_WIDTH = 1.9;

/** Drop from the bar's centre to the top of its label, in cm. */
const BARRIER_LABEL_DROP = 0.65;

export function bowTieToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = ['\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]'];

  for (const n of nodes) {
    const d = n.data as BowTieNodeData;
    const p = tf(n);
    // Barriers are bars (no inner text); other kinds carry their label.
    const isBarrier = d.nodeKind === 'preventive_barrier' || d.nodeKind === 'mitigative_barrier';
    const id = sanitizeId(n.id);
    const text = isBarrier ? '' : escapeLatex(d.label);
    lines.push(`  \\node[${COLOR_FIX(NODE_STYLE[d.nodeKind])}] (${id}) at ${coord(p)} {${text}};`);
    if (isBarrier && d.label) {
      lines.push(
        `  \\node[font=\\scriptsize, text width=${BARRIER_LABEL_WIDTH}cm, align=center, ` +
          `anchor=north] (${id}_label) at ($(${id})+(0,-${BARRIER_LABEL_DROP})$) ` +
          `{${escapeLatex(d.label)}};`,
      );
    }
  }

  for (const e of edges) {
    lines.push(`  \\draw[->] (${sanitizeId(e.source)}) -- (${sanitizeId(e.target)});`);
  }

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

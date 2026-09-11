import type { Node, Edge } from '@xyflow/react';
import type { EventTreeNodeData, EventTreeEdgeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';
import { hasOwnKey } from '../utils';

/**
 * `text width` rather than `minimum width`, at the width the canvas gives each
 * kind (128px and 112px at 80px/cm).
 *
 * A minimum is a floor, not a cap, so the box grew to fit its label on one
 * line: "Loss of main cooling water" stretched to about 4.5cm and printed
 * straight over the node beside it. The canvas wraps inside a fixed-width box
 * and grows downward; this does the same.
 */
const NODE_STYLE: Record<EventTreeNodeData['nodeKind'], string> = {
  initiating_event:
    'rectangle, draw, fill=orange!20, text width=1.6cm, align=center, minimum height=0.8cm',
  header: 'rectangle, draw, fill=blue!10, text width=1.6cm, align=center, minimum height=0.6cm',
  consequence:
    'rectangle, draw, fill=green!15, text width=1.4cm, align=center, minimum height=0.7cm',
};

function edgeLabel(d: EventTreeEdgeData | undefined): string {
  if (!d) return '';
  if (d.label) return d.label;
  const parts: string[] = [d.branchType];
  if (d.probability) parts.push(d.probability);
  return parts.join(' ');
}

export function eventTreeToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = ['\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]'];

  for (const n of nodes) {
    const d = n.data as EventTreeNodeData;
    const p = tf(n);
    // createNode always sets a known kind, but an imported file or an AI tool
    // call's properties can carry any string, and an unknown one was written out
    // as `\node[undefined]`, which LaTeX rejects. It is drawn as a header, the
    // default kind, instead.
    const style = hasOwnKey(NODE_STYLE, d.nodeKind) ? NODE_STYLE[d.nodeKind] : NODE_STYLE.header;
    lines.push(
      `  \\node[${style}] (${sanitizeId(n.id)}) at ${coord(p)} {${escapeLatex(d.label)}};`,
    );
  }

  for (const e of edges) {
    const label = edgeLabel(e.data as EventTreeEdgeData | undefined);
    const lbl = label
      ? ` node[midway, above, sloped, font=\\scriptsize]{${escapeLatex(label)}}`
      : '';
    lines.push(`  \\draw[->] (${sanitizeId(e.source)}) --${lbl} (${sanitizeId(e.target)});`);
  }

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

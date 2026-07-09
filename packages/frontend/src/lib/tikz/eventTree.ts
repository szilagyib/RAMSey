import type { Node, Edge } from '@xyflow/react';
import type { EventTreeNodeData, EventTreeEdgeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';

const NODE_STYLE: Record<EventTreeNodeData['nodeKind'], string> = {
  initiating_event: 'rectangle, draw, fill=orange!20, minimum width=1.8cm, minimum height=0.8cm',
  header: 'rectangle, draw, fill=blue!10, minimum width=1.4cm, minimum height=0.6cm',
  consequence: 'rectangle, draw, fill=green!15, minimum width=1.8cm, minimum height=0.7cm',
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
  const lines: string[] = [
    '\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]',
  ];

  for (const n of nodes) {
    const d = n.data as EventTreeNodeData;
    const p = tf(n.position);
    lines.push(
      `  \\node[${NODE_STYLE[d.nodeKind]}] (${sanitizeId(n.id)}) at ${coord(p)} {${escapeLatex(d.label)}};`,
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

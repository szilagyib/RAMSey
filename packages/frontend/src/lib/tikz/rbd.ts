import type { Node, Edge } from '@xyflow/react';
import type { RBDNodeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';

export function rbdToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = ['\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]'];

  for (const n of nodes) {
    const d = n.data as RBDNodeData;
    const p = tf(n.position);
    const id = sanitizeId(n.id);

    if (d.nodeKind === 'block') {
      lines.push(
        `  \\node[rectangle, draw, fill=blue!15, minimum width=1.6cm, ` +
          `minimum height=0.9cm] (${id}) at ${coord(p)} {${escapeLatex(d.label)}};`,
      );
    } else {
      // Terminal: a small solid node with its label beneath.
      lines.push(
        `  \\node[circle, draw, fill=black, minimum size=3pt, inner sep=0pt, ` +
          `label=below:{${escapeLatex(d.label)}}] (${id}) at ${coord(p)} {};`,
      );
    }
  }

  for (const e of edges) {
    lines.push(`  \\draw[->] (${sanitizeId(e.source)}) -- (${sanitizeId(e.target)});`);
  }

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

import type { Node, Edge } from '@xyflow/react';
import type { FaultTreeNodeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';

const GATE_SHAPE: Record<string, string> = {
  AND: 'and gate US',
  OR: 'or gate US',
  NOT: 'not gate US',
  XOR: 'xor gate US',
};

function eventStyle(eventType: FaultTreeNodeData['eventType']): string {
  switch (eventType) {
    case 'basic':
      return 'circle, draw, minimum size=0.9cm';
    case 'undeveloped':
      return 'diamond, draw, aspect=2, inner sep=1pt';
    case 'top':
      return 'rectangle, draw, very thick, minimum width=1.6cm, minimum height=0.7cm';
    case 'intermediate':
    default:
      return 'rectangle, draw, minimum width=1.4cm, minimum height=0.7cm';
  }
}

export function faultTreeToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = ['\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]'];

  for (const n of nodes) {
    const d = n.data as FaultTreeNodeData;
    const p = tf(n.position);
    const id = sanitizeId(n.id);
    const label = escapeLatex(d.label);

    if (d.nodeKind === 'gate') {
      const shape = d.gateType ? GATE_SHAPE[d.gateType] : undefined;
      if (shape) {
        // Rotate 90deg so the output points up for a top-down tree; label below.
        lines.push(
          `  \\node[${shape}, draw, rotate=90, logic gate inputs=nn, ` +
            `minimum size=0.8cm] (${id}) at ${coord(p)} {};`,
        );
        lines.push(`  \\node[font=\\small] at ($(${id})+(0,-0.75)$) {${label}};`);
      } else {
        // K_OF_N (no native shape): labeled box with a threshold note.
        const k = d.k ?? 1;
        lines.push(
          `  \\node[rectangle, draw, minimum width=1.2cm, minimum height=0.8cm] (${id}) at ${coord(p)} {$\\geq ${k}$};`,
        );
        lines.push(`  \\node[font=\\small] at ($(${id})+(0,-0.75)$) {${label}};`);
      }
    } else {
      lines.push(`  \\node[${eventStyle(d.eventType)}] (${id}) at ${coord(p)} {${label}};`);
    }
  }

  // Tree edges: plain lines, parent (source) down to child (target).
  for (const e of edges) {
    lines.push(`  \\draw (${sanitizeId(e.source)}) -- (${sanitizeId(e.target)});`);
  }

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

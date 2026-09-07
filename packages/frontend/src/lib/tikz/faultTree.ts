import type { Node, Edge } from '@xyflow/react';
import type { FaultTreeNodeData } from '../../types/diagram';
import { coord, makeTransform } from './coords';
import { escapeLatex, sanitizeId } from './latex';

/**
 * Height of a fault-tree symbol, in canvas px.
 *
 * Every kind draws its symbol 48px tall at the top of the node box — the gate
 * and event SVGs (GATE_SIZE / SYMBOL_SIZE) and the `h-12` description box alike
 * — with the caption, and any probability line, stacked underneath. The box is
 * therefore taller than the symbol, and it is the symbol that has to line up.
 */
const SYMBOL_HEIGHT = 48;

/**
 * How far right of a gate's centre its caption starts, in cm.
 *
 * On the canvas the caption sits directly under the symbol, but here the edge
 * to the gate's children drops straight down out of that same point, so a
 * label below it would be crossed by the line. Beside the gate is the nearest
 * position that stays legible. Offset from the centre rather than the `.east`
 * anchor because the gate shape is rotated, which rotates its anchors with it.
 */
const GATE_LABEL_DX = 0.55;
/** Same, for the wider (and unrotated) k-of-n box. */
const KN_LABEL_DX = 0.7;

/**
 * Width a symbol's caption wraps at, in cm — the canvas's own 88px allowance.
 *
 * The canvas truncates a caption that outgrows it, which is why captions never
 * collide there. Truncating would drop information from a report, so the export
 * wraps at the same width instead: same footprint, nothing lost.
 */
const CAPTION_WIDTH = 1.1;

const GATE_SHAPE: Record<string, string> = {
  AND: 'and gate US',
  OR: 'or gate US',
  NOT: 'not gate US',
  XOR: 'xor gate US',
};

/**
 * Whether the label goes inside the shape or underneath it — mirroring the
 * canvas, where a description box wraps its text inside the rectangle but a
 * symbol carries its caption below.
 *
 * This is not cosmetic. `minimum size` is a floor, not a cap, so a label placed
 * inside stretches the shape to fit it: a basic event reading "Pump A fails"
 * came out as a circle wide enough to hold that sentence, swallowing its
 * neighbours.
 */
function captionsBelow(eventType: FaultTreeNodeData['eventType']): boolean {
  return eventType === 'basic' || eventType === 'undeveloped';
}

function eventStyle(eventType: FaultTreeNodeData['eventType']): string {
  switch (eventType) {
    case 'basic':
      return 'circle, draw, minimum size=0.9cm';
    case 'undeveloped':
      return 'diamond, draw, aspect=2, inner sep=1pt';
    // `text width` makes the description box wrap at a fixed width and grow
    // downward, the way the canvas box does. Without it the box stretches into
    // one long line and runs over whatever sits beside it.
    case 'top':
      return 'rectangle, draw, very thick, text width=1.6cm, align=center, minimum height=0.7cm';
    case 'intermediate':
    default:
      return 'rectangle, draw, text width=1.6cm, align=center, minimum height=0.7cm';
  }
}

export function faultTreeToTikz(nodes: Node[], edges: Edge[]): string {
  const tf = makeTransform(nodes);
  const lines: string[] = ['\\begin{tikzpicture}[>=Stealth, every node/.style={font=\\small}]'];

  for (const n of nodes) {
    const d = n.data as FaultTreeNodeData;
    const p = tf(n, SYMBOL_HEIGHT);
    const id = sanitizeId(n.id);
    const label = escapeLatex(d.label);

    if (d.nodeKind === 'gate') {
      const shape = d.gateType ? GATE_SHAPE[d.gateType] : undefined;
      if (shape) {
        // Rotate 90deg so the output points up for a top-down tree.
        lines.push(
          `  \\node[${shape}, draw, rotate=90, logic gate inputs=nn, ` +
            `minimum size=0.8cm] (${id}) at ${coord(p)} {};`,
        );
        lines.push(
          `  \\node[font=\\small, anchor=west] at ($(${id})+(${GATE_LABEL_DX},0)$) {${label}};`,
        );
      } else {
        // K_OF_N (no native shape): labeled box with a threshold note.
        const k = d.k ?? 1;
        lines.push(
          `  \\node[rectangle, draw, minimum width=1.2cm, minimum height=0.8cm] (${id}) at ${coord(p)} {$\\geq ${k}$};`,
        );
        lines.push(
          `  \\node[font=\\small, anchor=west] at ($(${id})+(${KN_LABEL_DX},0)$) {${label}};`,
        );
      }
    } else if (captionsBelow(d.eventType)) {
      lines.push(
        `  \\node[${eventStyle(d.eventType)}, ` +
          `label={[text width=${CAPTION_WIDTH}cm, align=center]below:{${label}}}] ` +
          `(${id}) at ${coord(p)} {};`,
      );
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

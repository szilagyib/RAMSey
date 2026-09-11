import type { Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Coordinate transform: React Flow canvas (px, y-down) -> TikZ (cm, y-up)
// ---------------------------------------------------------------------------

/** Pixels per TikZ cm. ~80px gap reads as ~1cm; tuned so default spacing looks right. */
export const PX_PER_CM = 80;

export interface TikzPoint {
  x: number;
  y: number;
}

/**
 * Node box assumed when React Flow has not measured a node yet — the same
 * default the diagram store uses, and the size most symbols render at.
 *
 * Export runs from a rendered canvas, so this is a fallback rather than a
 * normal path. It is deliberately not 0: that would put us back on the node's
 * corner, which is the bug this transform exists to avoid.
 */
const FALLBACK_SIZE = 48;

/** Rendered extent of a node, falling back to the default box. */
function extentOf(node: Node): { width: number; height: number } {
  const measured = (node as { measured?: { width?: number; height?: number } }).measured;
  return {
    width: measured?.width ?? node.width ?? FALLBACK_SIZE,
    height: measured?.height ?? node.height ?? FALLBACK_SIZE,
  };
}

/**
 * Build a transform from the diagram's nodes: positions are normalized to the
 * bounding-box top-left, scaled px->cm, and the Y axis is flipped (TikZ is y-up).
 *
 * The returned function takes the **node**, not a bare point, because it has to
 * know how big the node is. React Flow's `position` is a node's top-left
 * corner, while TikZ centres a node on the coordinate handed to `at` — so
 * anchoring on the corner displaces every node by half its own size. Where all
 * the nodes match that displacement is uniform and the picture merely shifts
 * (which is why Markov chains always looked right); the moment sizes differ it
 * becomes a per-node skew, and a fault tree's 128px description boxes came out
 * 0.5cm off the 48px gates they belong above.
 *
 * `symbolHeight` overrides the vertical extent for nodes that draw their symbol
 * at the top of the box with a caption underneath: the box centre sits below
 * the symbol centre, and it is the symbol that has to line up.
 */
export function makeTransform(
  nodes: Node[],
  pxPerCm: number = PX_PER_CM,
): (node: Node, symbolHeight?: number) => TikzPoint {
  const minX = nodes.length ? Math.min(...nodes.map((n) => n.position.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((n) => n.position.y)) : 0;

  return (node, symbolHeight) => {
    const { width, height } = extentOf(node);
    return {
      x: round2((node.position.x + width / 2 - minX) / pxPerCm),
      // Flip Y so downward canvas growth becomes downward TikZ growth.
      y: round2(-(node.position.y + (symbolHeight ?? height) / 2 - minY) / pxPerCm),
    };
  };
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // avoid "-0" in output
}

/** Format a point as a TikZ coordinate literal, e.g. `(1.5,-2.25)`. */
export function coord(p: TikzPoint): string {
  return `(${p.x},${p.y})`;
}

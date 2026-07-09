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
 * Build a transform from the diagram's nodes: positions are normalized to the
 * bounding-box top-left, scaled px->cm, and the Y axis is flipped (TikZ is y-up).
 * Returns a function mapping a canvas position to TikZ coordinates (2 dp).
 */
export function makeTransform(
  nodes: Node[],
  pxPerCm: number = PX_PER_CM,
): (pos: { x: number; y: number }) => TikzPoint {
  const minX = nodes.length ? Math.min(...nodes.map((n) => n.position.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((n) => n.position.y)) : 0;

  return (pos) => ({
    x: round2((pos.x - minX) / pxPerCm),
    // Flip Y so downward canvas growth becomes downward TikZ growth.
    y: round2(-(pos.y - minY) / pxPerCm),
  });
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // avoid "-0" in output
}

/** Format a point as a TikZ coordinate literal, e.g. `(1.5,-2.25)`. */
export function coord(p: TikzPoint): string {
  return `(${p.x},${p.y})`;
}

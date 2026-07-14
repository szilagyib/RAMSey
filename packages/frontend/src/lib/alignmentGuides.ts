import type { Node } from '@xyflow/react';

/**
 * Alignment guides ("smart guides"): while a node is dragged, snap it to the
 * edges/centers of the other nodes and report the lines to draw.
 *
 * Snap-to-grid aligns to an abstract lattice; this aligns to what's actually on
 * the canvas — which is what makes a hand-built diagram look tidy (a gate
 * centered over its children, a row of blocks sharing a baseline).
 */

/** How close (in flow px) an edge/center must be before it snaps. */
export const SNAP_THRESHOLD = 6;

export interface Guide {
  /** 'x' = a vertical line at this coordinate; 'y' = a horizontal one. */
  axis: 'x' | 'y';
  position: number;
  /** Extent of the line, so it spans the involved nodes rather than the canvas. */
  start: number;
  end: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxOf(node: Node): Box {
  const m = (node as { measured?: { width?: number; height?: number } }).measured;
  return {
    x: node.position.x,
    y: node.position.y,
    w: m?.width ?? node.width ?? 48,
    h: m?.height ?? node.height ?? 48,
  };
}

/** The three candidate lines a box offers on each axis: start, center, end. */
function candidates(b: Box, axis: 'x' | 'y'): number[] {
  return axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];
}

export interface SnapResult {
  /** Corrected top-left position for the dragged node (unchanged if no snap). */
  position: { x: number; y: number };
  guides: Guide[];
}

/**
 * Snap `dragged` against `others`. Returns the corrected position plus the
 * guides to render. Only the closest candidate within SNAP_THRESHOLD wins per
 * axis, so a node never fights between two nearby targets.
 */
export function computeSnap(dragged: Box, others: Box[]): SnapResult {
  const result: SnapResult = { position: { x: dragged.x, y: dragged.y }, guides: [] };
  if (others.length === 0) return result;

  for (const axis of ['x', 'y'] as const) {
    const mine = candidates(dragged, axis);

    let best: { delta: number; line: number; other: Box } | null = null;
    for (const other of others) {
      for (const theirs of candidates(other, axis)) {
        for (const my of mine) {
          const delta = theirs - my; // how far to move to land on their line
          if (Math.abs(delta) <= SNAP_THRESHOLD) {
            if (!best || Math.abs(delta) < Math.abs(best.delta)) {
              best = { delta, line: theirs, other };
            }
          }
        }
      }
    }

    if (!best) continue;

    // Apply the correction on this axis.
    if (axis === 'x') result.position.x = dragged.x + best.delta;
    else result.position.y = dragged.y + best.delta;

    // The guide spans both boxes on the perpendicular axis, so it visually
    // connects what it aligned rather than crossing the whole canvas.
    const movedStart = axis === 'x' ? dragged.y : dragged.x;
    const movedEnd = movedStart + (axis === 'x' ? dragged.h : dragged.w);
    const otherStart = axis === 'x' ? best.other.y : best.other.x;
    const otherEnd = otherStart + (axis === 'x' ? best.other.h : best.other.w);

    result.guides.push({
      axis,
      position: best.line,
      start: Math.min(movedStart, otherStart),
      end: Math.max(movedEnd, otherEnd),
    });
  }

  return result;
}

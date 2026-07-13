/**
 * User-shapeable edges: every edge can carry an optional control point in its
 * data (cpX/cpY, flow coordinates). Curved edges bend through it as a
 * quadratic bezier; orthogonal (step) edges relocate their middle segment to
 * it — preserving the right-angle routing that the FT/RBD notations require.
 * Null/absent means "automatic routing".
 */

export interface EdgeControlData {
  cpX?: number | null;
  cpY?: number | null;
}

export function getControlPoint(data: unknown): { x: number; y: number } | null {
  const d = (data ?? {}) as EdgeControlData;
  if (typeof d.cpX === 'number' && typeof d.cpY === 'number') {
    return { x: d.cpX, y: d.cpY };
  }
  return null;
}

/**
 * Quadratic bezier through a control point. Returns [path, labelX, labelY]
 * with the label at the curve's t=0.5 point:
 * B(0.5) = 0.25·P0 + 0.5·C + 0.25·P1.
 */
export function quadraticPath(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
): [string, number, number] {
  const labelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
  const labelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;
  return [
    `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`,
    labelX,
    labelY,
  ];
}

/** A circular node, in flow coordinates. */
export interface Disc {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Quadratic path stopped at the target node's rim.
 *
 * A node's target handle is on its left, so an edge coming from a node further
 * right — a Markov repair rate, say — has to curve back and reach that handle
 * from *inside* the circle. The arrowhead is drawn at the path's end pointing
 * along its tangent, so it ends up under the node body (nodes paint above the
 * edge layer) and disappears. Trimming the curve where it first crosses the rim
 * puts the head outside the node, pointing at it.
 *
 * Returns null when the curve never enters the disc — the overwhelmingly common
 * case (a forward edge just touches the rim at the handle), so the caller keeps
 * the untrimmed path.
 */
export function trimQuadraticAtDisc(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  disc: Disc,
): string | null {
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * sourceX + 2 * u * t * controlX + t * t * targetX,
      y: u * u * sourceY + 2 * u * t * controlY + t * t * targetY,
    };
  };
  // Just touching the rim (the handle sits on it) must not count as entering,
  // or every edge would trim itself by a hair.
  const inside = (t: number) => {
    const p = at(t);
    return Math.hypot(p.x - disc.cx, p.y - disc.cy) < disc.r - 1;
  };

  const STEPS = 48;
  let lo = -1;
  for (let i = 1; i <= STEPS; i++) {
    if (inside(i / STEPS)) {
      lo = i - 1;
      break;
    }
  }
  if (lo < 0) return null; // never dives under the node

  // Bisect between the last outside sample and the first inside one.
  let a = lo / STEPS;
  let b = (lo + 1) / STEPS;
  for (let i = 0; i < 12; i++) {
    const mid = (a + b) / 2;
    if (inside(mid)) b = mid;
    else a = mid;
  }

  // de Casteljau: the [0, a] piece is itself a quadratic, with control point
  // lerp(P0, C, a) and end point B(a).
  const lerp = (p: number, q: number) => p + (q - p) * a;
  const end = at(a);
  return `M ${sourceX},${sourceY} Q ${lerp(sourceX, controlX)},${lerp(sourceY, controlY)} ${end.x},${end.y}`;
}

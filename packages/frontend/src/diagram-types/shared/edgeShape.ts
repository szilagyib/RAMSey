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

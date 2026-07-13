import { describe, it, expect } from 'vitest';
import {
  getControlPoint,
  quadraticPath,
  trimQuadraticAtDisc,
  type Disc,
} from '../../../src/diagram-types/shared/edgeShape';

describe('getControlPoint', () => {
  it('returns the point when both coordinates are numbers', () => {
    expect(getControlPoint({ cpX: 10, cpY: -5 })).toEqual({ x: 10, y: -5 });
  });

  it('returns null for absent, null (reset), or partial coordinates', () => {
    expect(getControlPoint({})).toBeNull();
    expect(getControlPoint(undefined)).toBeNull();
    expect(getControlPoint({ cpX: null, cpY: null })).toBeNull();
    expect(getControlPoint({ cpX: 10 })).toBeNull();
    expect(getControlPoint({ cpX: '10', cpY: '20' })).toBeNull();
  });
});

describe('quadraticPath', () => {
  it('builds a quadratic bezier through the control point', () => {
    const [path] = quadraticPath(0, 0, 50, 100, 100, 0);
    expect(path).toBe('M 0,0 Q 50,100 100,0');
  });

  it('places the label at the curve t=0.5 point (0.25·P0 + 0.5·C + 0.25·P1)', () => {
    const [, labelX, labelY] = quadraticPath(0, 0, 50, 100, 100, 0);
    expect(labelX).toBe(50); // 0 + 25 + 25
    expect(labelY).toBe(50); // 0 + 50 + 0
  });
});

describe('trimQuadraticAtDisc', () => {
  // A node at (315..375, 234..294): centre (345,264), radius 30. Its target
  // handle is the leftmost point of the circle, (315,264).
  const node: Disc = { cx: 345, cy: 264, r: 30 };

  /** End point of a quadratic path string "M x,y Q cx,cy ex,ey". */
  const endOf = (d: string) => {
    const [, end] = d.split('Q')[1].trim().split(/\s+/); // "cx,cy" "ex,ey"
    const [x, y] = end.split(',').map(Number);
    return { x, y };
  };
  const distToCentre = (p: { x: number; y: number }) => Math.hypot(p.x - node.cx, p.y - node.cy);

  it('leaves a forward edge alone — it only touches the rim at the handle', () => {
    // Comes from the left, arcs above, lands on the left handle from outside.
    expect(trimQuadraticAtDisc(95, 264, 205, 210, 315, 264, node)).toBeNull();
  });

  it('trims a reverse edge that would reach the handle from under the node', () => {
    // Comes from the right (a repair rate), dips below, and would arrive at the
    // left handle from inside the circle — burying the arrowhead.
    const trimmed = trimQuadraticAtDisc(535, 264, 425, 318, 315, 264, node);
    expect(trimmed).not.toBeNull();

    // It now stops on the rim rather than at the handle, so the head sits
    // outside the node.
    const end = endOf(trimmed!);
    expect(distToCentre(end)).toBeCloseTo(node.r - 1, 0);
    expect(end.x).toBeGreaterThan(315); // short of the left handle
  });

  it('keeps the curve pointing at the node: the trimmed end is on the approach side', () => {
    const trimmed = trimQuadraticAtDisc(535, 264, 425, 318, 315, 264, node)!;
    const end = endOf(trimmed);
    // Approached from below-right, so it exits the rim below-right of centre.
    expect(end.y).toBeGreaterThan(node.cy);
  });

  it('returns null when the curve stays clear of the node entirely', () => {
    expect(trimQuadraticAtDisc(0, 0, 50, 0, 100, 0, node)).toBeNull();
  });
});

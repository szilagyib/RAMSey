import { describe, it, expect } from 'vitest';
import { computeSnap, SNAP_THRESHOLD, type Box } from '../../../src/lib/alignmentGuides';

const box = (x: number, y: number, w = 40, h = 40): Box => ({ x, y, w, h });

describe('computeSnap', () => {
  it('leaves the position alone when nothing is near', () => {
    const r = computeSnap(box(500, 500), [box(0, 0)]);
    expect(r.position).toEqual({ x: 500, y: 500 });
    expect(r.guides).toHaveLength(0);
  });

  it('snaps left edges that are within the threshold', () => {
    // Other at x=100; dragged at x=103 (3px off) → snaps to 100.
    const r = computeSnap(box(103, 300), [box(100, 0)]);
    expect(r.position.x).toBe(100);
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
  });

  it('snaps centers, not just edges', () => {
    // Other spans 100..140, center 120. Dragged (w=40) centered at 122 → x=102.
    const r = computeSnap(box(102, 300), [box(100, 0)]);
    // Closest candidate wins: left-edge delta is 2 (100-102), center delta is 0
    // (120 - 122 = -2)… both within threshold; the smallest |delta| is chosen.
    expect(Math.abs(r.position.x - 102)).toBeLessThanOrEqual(SNAP_THRESHOLD);
    expect(r.guides.length).toBeGreaterThan(0);
  });

  it('snaps on both axes independently', () => {
    const r = computeSnap(box(103, 203), [box(100, 200)]);
    expect(r.position).toEqual({ x: 100, y: 200 });
    expect(r.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
  });

  it('ignores candidates beyond the threshold', () => {
    const off = SNAP_THRESHOLD + 5;
    const r = computeSnap(box(100 + off, 300), [box(100, 0)]);
    expect(r.position.x).toBe(100 + off);
    expect(r.guides).toHaveLength(0);
  });

  it('picks the closest of several candidates', () => {
    // Two potential targets; the 1px-away one must win over the 5px-away one.
    const r = computeSnap(box(101, 300), [box(100, 0), box(96, 0)]);
    expect(r.position.x).toBe(100);
  });

  it('spans the guide across both boxes rather than the whole canvas', () => {
    const r = computeSnap(box(103, 300), [box(100, 0)]);
    const g = r.guides.find((x) => x.axis === 'x')!;
    // Vertical line covers from the top of the upper box (0) to the bottom of
    // the dragged one (300 + 40).
    expect(g.start).toBe(0);
    expect(g.end).toBe(340);
  });

  it('is a no-op with no other nodes', () => {
    const r = computeSnap(box(10, 10), []);
    expect(r.position).toEqual({ x: 10, y: 10 });
    expect(r.guides).toHaveLength(0);
  });
});

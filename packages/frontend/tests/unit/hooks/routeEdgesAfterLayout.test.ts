import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { routeEdgesAfterLayout } from '../../../src/hooks/useAutoLayout';

const node = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  data: {},
  width: 48,
  height: 48,
});

const edge = (id: string, source: string, target: string, data: object = {}): Edge => ({
  id,
  source,
  target,
  data,
});

const cpOf = (e: Edge) => e.data as { cpX: number | null; cpY: number | null };

/** Mirrors PAIR_ARC in useAutoLayout — the arc offset given to a paired edge. */
const PAIR_ARC = 70;

describe('routeEdgesAfterLayout', () => {
  // 48x48 nodes, so centers sit at position + 24.
  const nodes = [node('a', 0, 0), node('b', 200, 0)];

  // Auto Layout must not throw away the shaping a user dragged into an edge.
  // The point is stored in absolute flow coordinates, so it is carried into the
  // edge's new frame rather than left pointing at where the nodes used to be.
  describe('hand-placed control points', () => {
    it('moves a control point with its endpoints', () => {
      const before = nodes;
      const after = [node('a', 100, 50), node('b', 300, 50)];
      // Halfway along the edge, 76px below it.
      const shaped = edge('e1', 'a', 'b', { cpX: 124, cpY: 100 });

      const [e] = routeEdgesAfterLayout(after, [shaped], before);

      // Endpoints translated by (+100, +50), so the bend does too.
      expect(cpOf(e).cpX).toBeCloseTo(224, 5);
      expect(cpOf(e).cpY).toBeCloseTo(150, 5);
    });

    it('rotates the bend with the edge', () => {
      const before = nodes;
      // 'b' moves below 'a': the same edge is now vertical.
      const after = [node('a', 0, 0), node('b', 0, 200)];
      const shaped = edge('e1', 'a', 'b', { cpX: 124, cpY: 100 });

      const [e] = routeEdgesAfterLayout(after, [shaped], before);

      // Still halfway along (y = 24 + 100) and still 76px off to the side,
      // which is now the left (x = 24 - 76).
      expect(cpOf(e).cpX).toBeCloseTo(-52, 5);
      expect(cpOf(e).cpY).toBeCloseTo(124, 5);
    });

    it('keeps the bend proportional when the layout stretches the edge', () => {
      const before = nodes;
      // Same direction, double the distance.
      const after = [node('a', 0, 0), node('b', 400, 0)];
      const shaped = edge('e1', 'a', 'b', { cpX: 74, cpY: 100 });

      const [e] = routeEdgesAfterLayout(after, [shaped], before);

      // Was a quarter of the way along (50 of 200) — still is (100 of 400) —
      // while the 76px perpendicular depth of the bend is unchanged.
      expect(cpOf(e).cpX).toBeCloseTo(124, 5);
      expect(cpOf(e).cpY).toBeCloseTo(100, 5);
    });

    it('survives a layout that leaves the nodes where they were', () => {
      const shaped = edge('e1', 'a', 'b', { cpX: 124, cpY: 100 });

      const [e] = routeEdgesAfterLayout(nodes, [shaped], nodes);

      expect(cpOf(e).cpX).toBeCloseTo(124, 5);
      expect(cpOf(e).cpY).toBeCloseTo(100, 5);
    });
  });

  it('leaves an unshaped single edge on automatic routing', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'b')], nodes);
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });

  it('arcs a bidirectional pair to OPPOSITE sides so they never overlap', () => {
    const routed = routeEdgesAfterLayout(
      nodes,
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')],
      nodes,
    );
    const [ab, ba] = routed.map((e) => e.data as { cpX: number; cpY: number });

    // Nodes sit on a horizontal line; their centers' midpoint is (124, 24).
    const midY = 24;
    // Both control points share the x midpoint...
    expect(ab.cpX).toBeCloseTo(ba.cpX, 5);
    // ...and sit equidistant on OPPOSITE sides of the connecting line: the two
    // arcs mirror about the midpoint, so the edges can never coincide.
    expect(ab.cpY - midY).toBeCloseTo(-(ba.cpY - midY), 5);
    expect(Math.abs(ab.cpY - midY)).toBeGreaterThan(0);
  });

  // Behaviour change worth pinning: a pair's arcs used to be recomputed on every
  // layout. They are now control points like any other, so the second layout
  // remaps them instead — they must still end up on opposite sides.
  it('keeps a bidirectional pair apart across repeated layouts', () => {
    const first = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')], nodes);

    const moved = [node('a', 500, 300), node('b', 500, 700)];
    const second = routeEdgesAfterLayout(moved, first, nodes);
    const [ab, ba] = second.map((e) => e.data as { cpX: number; cpY: number });

    // The edge is vertical now, so the two arcs straddle it in x, around the
    // midpoint of the moved centers (524, 524).
    const midX = 524;
    expect(ab.cpX - midX).toBeCloseTo(-(ba.cpX - midX), 5);
    expect(Math.abs(ab.cpX - midX)).toBeCloseTo(PAIR_ARC, 5);
    expect(ab.cpY).toBeCloseTo(ba.cpY, 5);
  });

  it('preserves other edge data (labels, rates)', () => {
    const [e] = routeEdgesAfterLayout(
      nodes,
      [edge('e1', 'a', 'b', { label: 'λ', rate: '0.01' })],
      nodes,
    );
    expect(e.data).toMatchObject({ label: 'λ', rate: '0.01' });
  });

  it('leaves edges referencing missing nodes on automatic routing', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'ghost')], nodes);
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });

  // A self-loop is its own reverse, so it must NOT get a pair control point
  // (that lands at the node centre and hides the loop under the node); the edge
  // component draws its own loop.
  it('clears the control point on a self-loop instead of arcing it', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'a', { cpX: 5, cpY: 5 })], nodes);
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });

  // A node the previous layout never saw (freshly added) gives nothing to
  // decompose against, so the edge falls back to automatic routing.
  it('falls back to automatic routing when the endpoint is new', () => {
    const [e] = routeEdgesAfterLayout(
      nodes,
      [edge('e1', 'a', 'b', { cpX: 124, cpY: 100 })],
      [node('a', 0, 0)],
    );
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });
});

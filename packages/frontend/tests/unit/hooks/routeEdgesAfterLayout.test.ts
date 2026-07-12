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

describe('routeEdgesAfterLayout', () => {
  const nodes = [node('a', 0, 0), node('b', 200, 0)];

  it('clears control points on single (unpaired) edges', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'b', { cpX: 5, cpY: 5 })]);
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });

  it('arcs a bidirectional pair to OPPOSITE sides so they never overlap', () => {
    const routed = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]);
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

  it('keeps stale control points from surviving a re-layout', () => {
    const stale = edge('e1', 'a', 'b', { cpX: 9999, cpY: 9999 });
    const [e] = routeEdgesAfterLayout(nodes, [stale]);
    expect((e.data as { cpX: unknown }).cpX).toBeNull();
  });

  it('preserves other edge data (labels, rates)', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'b', { label: 'λ', rate: '0.01' })]);
    expect(e.data).toMatchObject({ label: 'λ', rate: '0.01' });
  });

  it('leaves edges referencing missing nodes on automatic routing', () => {
    const [e] = routeEdgesAfterLayout(nodes, [edge('e1', 'a', 'ghost')]);
    expect(e.data).toMatchObject({ cpX: null, cpY: null });
  });
});

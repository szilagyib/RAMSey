import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { validate as validateFaultTree } from '../../../../src/diagram-types/fault-tree/validation';

/**
 * The solver identifies a gate by the signal it produces, so a gate wired
 * straight into another gate — or two gates sharing one output — silently drops
 * a whole branch from the cut sets. Both draw fine on the canvas and return a
 * confident, wrong answer, which is exactly why they must be caught here.
 */
const gate = (id: string, gateType: string): Node => ({
  id,
  type: 'gateNode',
  position: { x: 0, y: 0 },
  data: { label: id, nodeKind: 'gate', gateType },
});

const event = (id: string, eventType: string): Node => ({
  id,
  type: 'eventNode',
  position: { x: 0, y: 0 },
  data: { label: id, nodeKind: 'event', eventType, probability: '0.01' },
});

const edge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  type: 'treeEdge',
});

const codes = (nodes: Node[], edges: Edge[]) =>
  validateFaultTree(nodes, edges).errors.map((e) => e.code);

describe('fault-tree structure validation', () => {
  it('rejects a gate wired straight into another gate', () => {
    // BE1,BE2 -> OR -> AND <- BE3 ... with OR feeding the AND directly.
    const nodes = [
      event('TOP', 'top'),
      gate('AND', 'AND'),
      gate('OR', 'OR'),
      event('BE1', 'basic'),
      event('BE2', 'basic'),
      event('BE3', 'basic'),
    ];
    const edges = [
      edge('AND', 'TOP'),
      edge('OR', 'AND'), // <- the trap
      edge('BE3', 'AND'),
      edge('BE1', 'OR'),
      edge('BE2', 'OR'),
    ];
    expect(codes(nodes, edges)).toContain('GATE_FEEDS_GATE');
  });

  it('rejects two gates producing the same event — one of them would vanish', () => {
    const nodes = [
      event('TOP', 'top'),
      event('IE', 'intermediate'),
      gate('OR1', 'OR'),
      gate('OR2', 'OR'),
      event('BE1', 'basic'),
      event('BE2', 'basic'),
    ];
    const edges = [
      edge('OR1', 'IE'),
      edge('OR2', 'IE'), // <- both gates output the same event
      edge('IE', 'TOP'),
      edge('BE1', 'OR1'),
      edge('BE2', 'OR2'),
    ];
    expect(codes(nodes, edges)).toContain('EVENT_MULTIPLE_GATES');
  });

  it('rejects a gate with no output', () => {
    const nodes = [
      event('TOP', 'top'),
      gate('OR', 'OR'),
      event('BE1', 'basic'),
      event('BE2', 'basic'),
    ];
    const edges = [edge('BE1', 'OR'), edge('BE2', 'OR')];
    expect(codes(nodes, edges)).toContain('GATE_NO_OUTPUT');
  });

  it('accepts the correct notation: gate -> intermediate event -> gate', () => {
    const nodes = [
      event('TOP', 'top'),
      gate('AND', 'AND'),
      gate('OR', 'OR'),
      event('IE', 'intermediate'),
      event('BE1', 'basic'),
      event('BE2', 'basic'),
      event('BE3', 'basic'),
    ];
    const edges = [
      edge('AND', 'TOP'),
      edge('IE', 'AND'),
      edge('BE3', 'AND'),
      edge('OR', 'IE'), // gate outputs an intermediate event
      edge('BE1', 'OR'),
      edge('BE2', 'OR'),
    ];
    const structural = codes(nodes, edges).filter((c) =>
      ['GATE_FEEDS_GATE', 'EVENT_MULTIPLE_GATES', 'GATE_NO_OUTPUT'].includes(c),
    );
    expect(structural).toEqual([]);
  });
});

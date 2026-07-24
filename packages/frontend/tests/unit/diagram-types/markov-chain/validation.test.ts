import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';

// Mock @ramsey/engine to avoid full engine dependency in frontend unit tests
vi.mock('@ramsey/engine', () => ({
  createDefaultMarkovIR: vi.fn(() => ({
    version: '1.0.0',
    type: 'markov_chain',
    unitConfig: { timeBase: 'hours', rateBase: '1/h' },
    components: [],
    events: [],
    gates: [],
    states: [],
    transitions: [],
    blocks: [],
    barriers: [],
    dependencies: [],
    parameters: [],
    distributions: [],
    initialCondition: { type: 'single', stateId: '' },
    repairPolicy: { type: 'unlimited' },
  })),
  validateMarkovChain: vi.fn(() => ({
    valid: true,
    errors: [],
    warnings: [],
  })),
}));

// Import after mock setup
import { validateMarkovDiagram } from '../../../../src/diagram-types/markov-chain/validation';

function makeNode(id: string, label: string, stateType = 'operational', isInitial = false): Node {
  return {
    id,
    type: 'stateNode',
    position: { x: 0, y: 0 },
    data: { label, stateType, isInitial },
  };
}

function makeEdge(id: string, source: string, target: string, rate = '0.001'): Edge {
  return {
    id,
    type: 'transitionEdge',
    source,
    target,
    data: { rate, probability: '', label: '' },
  };
}

describe('validateMarkovDiagram', () => {
  it('returns error for empty diagram', () => {
    const result = validateMarkovDiagram([], []);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('EMPTY_DIAGRAM');
  });

  it('warns for single-node diagram', () => {
    const nodes = [makeNode('s0', 'S0', 'operational', true)];
    const result = validateMarkovDiagram(nodes, []);

    expect(result.warnings.some((w) => w.code === 'SINGLE_STATE')).toBe(true);
  });

  it('passes for valid two-state diagram', () => {
    const nodes = [makeNode('s0', 'S0', 'operational', true), makeNode('s1', 'S1', 'failed')];
    const edges = [makeEdge('e0', 's0', 's1')];

    const result = validateMarkovDiagram(nodes, edges);

    // Should have no frontend-level errors
    expect(result.errors.filter((e) => e.code !== 'EMPTY_DIAGRAM')).toHaveLength(0);
  });

  it('warns when no initial state is marked', () => {
    const nodes = [
      makeNode('s0', 'S0', 'operational', false),
      makeNode('s1', 'S1', 'failed', false),
    ];
    const edges = [makeEdge('e0', 's0', 's1')];

    const result = validateMarkovDiagram(nodes, edges);

    expect(result.warnings.some((w) => w.code === 'NO_INITIAL_STATE')).toBe(true);
  });

  it('errors when a node has no label', () => {
    const nodes = [makeNode('s0', '', 'operational', true), makeNode('s1', 'S1', 'failed')];
    const edges = [makeEdge('e0', 's0', 's1')];

    const result = validateMarkovDiagram(nodes, edges);

    expect(result.errors.some((e) => e.code === 'MISSING_LABEL')).toBe(true);
  });

  it('warns when no transitions exist between multiple states', () => {
    const nodes = [makeNode('s0', 'S0', 'operational', true), makeNode('s1', 'S1', 'failed')];

    const result = validateMarkovDiagram(nodes, []);

    expect(result.warnings.some((w) => w.code === 'NO_TRANSITIONS')).toBe(true);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiagramStore } from '../../../src/stores/diagramStore';

// Same mocks as diagramStore.test.ts: avoid the engine dependency and make
// created nodes/edges deterministic.
vi.mock('../../../src/diagram-types/markov-chain/validation', () => ({
  validateMarkovDiagram: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));

vi.mock('../../../src/diagram-types/markov-chain/defaults', () => ({
  createNewState: vi.fn(
    (position: { x: number; y: number }, counter: number, stateType: string) => ({
      id: `state-${counter}`,
      type: 'stateNode',
      position,
      data: {
        label: `S${counter}`,
        stateType: stateType || 'operational',
        isInitial: counter === 0,
      },
    }),
  ),
  createNewTransition: vi.fn((source: string, target: string, counter: number) => ({
    id: `transition-${counter}`,
    type: 'transitionEdge',
    source,
    target,
    data: { rate: '', probability: '', label: '' },
  })),
  createNode: vi.fn((position: { x: number; y: number }, counter: number, subType?: string) => ({
    id: `state-${counter}`,
    type: 'stateNode',
    position,
    data: { label: `S${counter}`, stateType: subType || 'operational', isInitial: counter === 0 },
  })),
  createEdge: vi.fn((source: string, target: string, counter: number) => ({
    id: `transition-${counter}`,
    type: 'transitionEdge',
    source,
    target,
    data: { rate: '', probability: '', label: '' },
  })),
}));

const state = () => useDiagramStore.getState();

describe('selection model', () => {
  beforeEach(() => {
    state().loadDiagram([], [], 'markov_chain');
  });

  it('selectAll flags every node and edge', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 100, y: 0 });
    state().onConnect({
      source: 'state-0',
      target: 'state-1',
      sourceHandle: null,
      targetHandle: null,
    });

    state().selectAll();
    expect(state().nodes.every((n) => n.selected)).toBe(true);
    expect(state().edges.every((e) => e.selected)).toBe(true);
  });

  it('clearSelection strips multi-selection flags and store ids', () => {
    state().addNode({ x: 0, y: 0 });
    state().selectNode('state-0');
    state().selectAll();

    state().clearSelection();
    expect(state().selectedNodeId).toBeNull();
    expect(state().nodes.some((n) => n.selected)).toBe(false);
    expect(state().edges.some((e) => e.selected)).toBe(false);
  });

  it('deleteSelected removes the whole multi-selection in one undo entry', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 100, y: 0 });
    state().addNode({ x: 200, y: 0 });
    state().onConnect({
      source: 'state-0',
      target: 'state-1',
      sourceHandle: null,
      targetHandle: null,
    });

    // Rubber-band style: two nodes flagged by React Flow.
    useDiagramStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id !== 'state-2' ? { ...n, selected: true } : n)),
    }));
    const undoBefore = state().undoStack.length;
    state().deleteSelected();

    expect(state().nodes.map((n) => n.id)).toEqual(['state-2']);
    expect(state().edges).toHaveLength(0); // connected edge went too
    expect(state().undoStack.length).toBe(undoBefore + 1);

    state().undo();
    expect(state().nodes).toHaveLength(3);
    expect(state().edges).toHaveLength(1);
  });

  it('deleteSelected also honors a flagged edge-only selection', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 100, y: 0 });
    state().onConnect({
      source: 'state-0',
      target: 'state-1',
      sourceHandle: null,
      targetHandle: null,
    });
    useDiagramStore.setState((s) => ({
      edges: s.edges.map((e) => ({ ...e, selected: true })),
    }));

    state().deleteSelected();
    expect(state().nodes).toHaveLength(2);
    expect(state().edges).toHaveLength(0);
  });

  it('deleteSelected with nothing selected records no history', () => {
    state().addNode({ x: 0, y: 0 });
    const undoBefore = state().undoStack.length;
    state().clearSelection();
    state().deleteSelected();
    expect(state().nodes).toHaveLength(1);
    expect(state().undoStack.length).toBe(undoBefore);
  });
});

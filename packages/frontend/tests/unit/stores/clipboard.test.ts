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

describe('diagram clipboard', () => {
  beforeEach(() => {
    state().loadDiagram([], [], 'markov_chain');
    useDiagramStore.setState({ clipboard: null });
  });

  it('copy + paste clones the selected node with a fresh id and an offset', () => {
    state().addNode({ x: 100, y: 100 });
    state().selectNode('state-0');
    expect(state().copySelection()).toBe(true);
    state().paste();

    expect(state().nodes).toHaveLength(2);
    const pasted = state().nodes[1];
    expect(pasted.id).not.toBe('state-0');
    expect(pasted.position).toEqual({ x: 132, y: 132 });
    expect(pasted.data.label).toBe('S0'); // data cloned
    expect(pasted.selected).toBe(true);
    expect(state().selectedNodeId).toBe(pasted.id);
  });

  it('copies a multi-selected subgraph including only internal edges', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 200, y: 0 });
    state().addNode({ x: 400, y: 0 });
    state().onConnect({
      source: 'state-0',
      target: 'state-1',
      sourceHandle: null,
      targetHandle: null,
    });
    state().onConnect({
      source: 'state-1',
      target: 'state-2',
      sourceHandle: null,
      targetHandle: null,
    });

    // Multi-select the first two nodes (React Flow style .selected flags).
    useDiagramStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id !== 'state-2' })),
    }));
    state().copySelection();
    state().paste();

    expect(state().nodes).toHaveLength(5);
    // Only the internal edge (state-0 -> state-1) was cloned, not the edge to
    // the unselected state-2.
    expect(state().edges).toHaveLength(3);
    const cloned = state().edges[2];
    expect(cloned.source).toMatch(/^copy-/);
    expect(cloned.target).toMatch(/^copy-/);
  });

  it('repeated paste cascades the offset', () => {
    state().addNode({ x: 0, y: 0 });
    state().selectNode('state-0');
    state().copySelection();
    state().paste();
    state().paste();

    expect(state().nodes).toHaveLength(3);
    expect(state().nodes[1].position).toEqual({ x: 32, y: 32 });
    expect(state().nodes[2].position).toEqual({ x: 64, y: 64 });
  });

  it('a pasted Markov state never keeps the initial-state marker', () => {
    state().addNode({ x: 0, y: 0 }); // state-0 has isInitial: true
    state().selectNode('state-0');
    state().copySelection();
    state().paste();

    expect(state().nodes[0].data.isInitial).toBe(true);
    expect(state().nodes[1].data.isInitial).toBe(false);
  });

  it('paste is a single undo entry', () => {
    state().addNode({ x: 0, y: 0 });
    state().selectNode('state-0');
    state().copySelection();
    const before = state().undoStack.length;
    state().paste();
    expect(state().undoStack.length).toBe(before + 1);

    state().undo();
    expect(state().nodes).toHaveLength(1);
  });

  it('duplicate works in one step; copy/paste no-op without selection/clipboard', () => {
    state().duplicateSelection(); // nothing selected
    expect(state().nodes).toHaveLength(0);
    state().paste(); // empty clipboard
    expect(state().nodes).toHaveLength(0);

    state().addNode({ x: 0, y: 0 });
    state().selectNode('state-0');
    state().duplicateSelection();
    expect(state().nodes).toHaveLength(2);
  });
});

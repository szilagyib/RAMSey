import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiagramStore } from '../../../src/stores/diagramStore';

// Same mocks as diagramStore.test.ts: avoid the engine dependency and make
// created nodes/edges deterministic.
vi.mock('../../../src/diagram-types/markov-chain/validation', () => ({
  validateMarkovDiagram: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));

vi.mock('../../../src/diagram-types/markov-chain/defaults', () => ({
  createNewState: vi.fn((position: { x: number; y: number }, counter: number, stateType: string) => ({
    id: `state-${counter}`,
    type: 'stateNode',
    position,
    data: { label: `S${counter}`, stateType: stateType || 'operational', isInitial: counter === 0 },
  })),
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

describe('diagram undo/redo', () => {
  beforeEach(() => {
    // loadDiagram resets nodes/edges, counters, stacks AND the coalescing tag.
    state().loadDiagram([], [], 'markov_chain');
  });

  it('undoes and redoes an addNode', () => {
    state().addNode({ x: 0, y: 0 });
    expect(state().nodes).toHaveLength(1);
    expect(state().undoStack).toHaveLength(1);

    state().undo();
    expect(state().nodes).toHaveLength(0);
    expect(state().redoStack).toHaveLength(1);

    state().redo();
    expect(state().nodes).toHaveLength(1);
    expect(state().nodes[0].id).toBe('state-0');
  });

  it('restores the node counter on undo (labels do not skip)', () => {
    state().addNode({ x: 0, y: 0 });
    state().undo();
    state().addNode({ x: 0, y: 0 });
    expect(state().nodes[0].data.label).toBe('S0');
  });

  it('coalesces rapid property edits on the same node into one entry', () => {
    state().addNode({ x: 0, y: 0 });
    state().updateNodeData('state-0', { label: 'P' });
    state().updateNodeData('state-0', { label: 'Pu' });
    state().updateNodeData('state-0', { label: 'Pump' });
    expect(state().undoStack).toHaveLength(2); // add + one coalesced edit

    state().undo();
    expect(state().nodes[0].data.label).toBe('S0'); // whole burst reverted
  });

  it('keeps edits on different nodes as separate entries', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 100, y: 0 });
    state().updateNodeData('state-0', { label: 'A' });
    state().updateNodeData('state-1', { label: 'B' });
    expect(state().undoStack).toHaveLength(4);
  });

  it('treats a whole drag as one entry and ends it on dragging:false', () => {
    state().addNode({ x: 0, y: 0 });
    const drag = (x: number, dragging: boolean) =>
      state().onNodesChange([
        { id: 'state-0', type: 'position', position: { x, y: 0 }, dragging },
      ]);
    drag(10, true);
    drag(20, true);
    drag(30, false);
    expect(state().undoStack).toHaveLength(2); // add + one drag
    expect(state().nodes[0].position.x).toBe(30);

    state().undo();
    expect(state().nodes[0].position.x).toBe(0);

    // A second drag after the first ended is a NEW entry.
    state().redo();
    drag(50, true);
    drag(60, false);
    expect(state().undoStack).toHaveLength(3);
  });

  it('does not record selection changes', () => {
    state().addNode({ x: 0, y: 0 });
    state().onNodesChange([{ id: 'state-0', type: 'select', selected: true }]);
    state().selectNode('state-0');
    expect(state().undoStack).toHaveLength(1); // only the add
  });

  it('undoing a delete restores the node together with its edges', () => {
    state().addNode({ x: 0, y: 0 });
    state().addNode({ x: 100, y: 0 });
    state().onConnect({ source: 'state-0', target: 'state-1', sourceHandle: null, targetHandle: null });
    state().selectNode('state-0');
    state().deleteSelected();
    expect(state().nodes).toHaveLength(1);
    expect(state().edges).toHaveLength(0);

    state().undo();
    expect(state().nodes).toHaveLength(2);
    expect(state().edges).toHaveLength(1);
  });

  it('a new edit clears the redo stack', () => {
    state().addNode({ x: 0, y: 0 });
    state().undo();
    expect(state().redoStack).toHaveLength(1);
    state().addNode({ x: 50, y: 50 });
    expect(state().redoStack).toHaveLength(0);
  });

  it('runInHistoryEntry groups several mutations into one entry', () => {
    state().runInHistoryEntry(() => {
      state().addNode({ x: 0, y: 0 });
      state().addNode({ x: 100, y: 0 });
      state().updateNodeData('state-0', { label: 'X' });
    });
    expect(state().undoStack).toHaveLength(1);

    state().undo();
    expect(state().nodes).toHaveLength(0);
  });

  it('loadDiagram clears history (no cross-document undo)', () => {
    state().addNode({ x: 0, y: 0 });
    state().loadDiagram([], [], 'markov_chain');
    expect(state().undoStack).toHaveLength(0);
    expect(state().redoStack).toHaveLength(0);
    state().undo(); // no-op, no crash
    expect(state().nodes).toHaveLength(0);
  });

  it('undo/redo with empty stacks are no-ops', () => {
    expect(() => {
      state().undo();
      state().redo();
    }).not.toThrow();
  });

  it('caps the undo stack at 100 entries', () => {
    for (let i = 0; i < 110; i++) {
      state().addNode({ x: i, y: 0 });
    }
    expect(state().undoStack).toHaveLength(100);
  });
});

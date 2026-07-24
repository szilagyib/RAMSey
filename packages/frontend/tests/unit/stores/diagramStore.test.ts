import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiagramStore } from '../../../src/stores/diagramStore';

// Mock the validation module to avoid engine dependency in unit tests
vi.mock('../../../src/diagram-types/markov-chain/validation', () => ({
  validateMarkovDiagram: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));

// Mock the defaults module
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
  // registry.ts imports createNode/createEdge — the mock must provide them too.
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

describe('DiagramStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useDiagramStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      nodeCounter: 0,
      edgeCounter: 0,
    });
  });

  describe('addNode', () => {
    it('adds a node with auto-generated label S0', () => {
      const { addNode } = useDiagramStore.getState();
      addNode({ x: 100, y: 200 });

      const { nodes, nodeCounter } = useDiagramStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('state-0');
      expect(nodes[0].data.label).toBe('S0');
      expect(nodeCounter).toBe(1);
    });

    it('increments label counter: S0, S1, S2', () => {
      const { addNode } = useDiagramStore.getState();
      addNode({ x: 0, y: 0 });
      addNode({ x: 100, y: 0 });
      addNode({ x: 200, y: 0 });

      const { nodes } = useDiagramStore.getState();
      expect(nodes).toHaveLength(3);
      expect(nodes[0].data.label).toBe('S0');
      expect(nodes[1].data.label).toBe('S1');
      expect(nodes[2].data.label).toBe('S2');
    });

    it('adds node with specified state type', () => {
      const { addNode } = useDiagramStore.getState();
      addNode({ x: 0, y: 0 }, 'failed');

      const { nodes } = useDiagramStore.getState();
      expect(nodes[0].data.stateType).toBe('failed');
    });
  });

  describe('onConnect', () => {
    it('creates an edge between two nodes', () => {
      useDiagramStore.setState({
        nodes: [
          { id: 'state-0', type: 'stateNode', position: { x: 0, y: 0 }, data: {} },
          { id: 'state-1', type: 'stateNode', position: { x: 200, y: 0 }, data: {} },
        ],
      });

      const { onConnect } = useDiagramStore.getState();
      onConnect({ source: 'state-0', target: 'state-1', sourceHandle: null, targetHandle: null });

      const { edges, edgeCounter } = useDiagramStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('state-0');
      expect(edges[0].target).toBe('state-1');
      expect(edgeCounter).toBe(1);
    });
  });

  describe('updateNodeData', () => {
    it('updates node data by id', () => {
      useDiagramStore.setState({
        nodes: [
          {
            id: 'state-0',
            type: 'stateNode',
            position: { x: 0, y: 0 },
            data: { label: 'S0', stateType: 'operational', isInitial: false },
          },
        ],
      });

      const { updateNodeData } = useDiagramStore.getState();
      updateNodeData('state-0', { label: 'Working', isInitial: true });

      const { nodes } = useDiagramStore.getState();
      expect(nodes[0].data.label).toBe('Working');
      expect(nodes[0].data.isInitial).toBe(true);
      expect(nodes[0].data.stateType).toBe('operational');
    });
  });

  describe('updateEdgeData', () => {
    it('updates edge data by id', () => {
      useDiagramStore.setState({
        edges: [
          {
            id: 'transition-0',
            type: 'transitionEdge',
            source: 'state-0',
            target: 'state-1',
            data: { rate: '', probability: '', label: '' },
          },
        ],
      });

      const { updateEdgeData } = useDiagramStore.getState();
      updateEdgeData('transition-0', { rate: '0.001', label: 'λ₁' });

      const { edges } = useDiagramStore.getState();
      expect(edges[0].data.rate).toBe('0.001');
      expect(edges[0].data.label).toBe('λ₁');
      expect(edges[0].data.probability).toBe('');
    });
  });

  describe('deleteSelected', () => {
    it('removes selected node and its connected edges', () => {
      useDiagramStore.setState({
        nodes: [
          { id: 'state-0', type: 'stateNode', position: { x: 0, y: 0 }, data: {} },
          { id: 'state-1', type: 'stateNode', position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: 'e0', type: 'transitionEdge', source: 'state-0', target: 'state-1', data: {} },
        ],
        selectedNodeId: 'state-0',
      });

      const { deleteSelected } = useDiagramStore.getState();
      deleteSelected();

      const { nodes, edges, selectedNodeId } = useDiagramStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('state-1');
      expect(edges).toHaveLength(0);
      expect(selectedNodeId).toBeNull();
    });

    it('removes selected edge', () => {
      useDiagramStore.setState({
        edges: [
          { id: 'e0', type: 'transitionEdge', source: 'state-0', target: 'state-1', data: {} },
          { id: 'e1', type: 'transitionEdge', source: 'state-1', target: 'state-0', data: {} },
        ],
        selectedEdgeId: 'e0',
      });

      const { deleteSelected } = useDiagramStore.getState();
      deleteSelected();

      const { edges, selectedEdgeId } = useDiagramStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('e1');
      expect(selectedEdgeId).toBeNull();
    });
  });

  describe('selection', () => {
    it('selectNode sets node and clears edge', () => {
      useDiagramStore.setState({ selectedEdgeId: 'e0' });

      const { selectNode } = useDiagramStore.getState();
      selectNode('state-0');

      const { selectedNodeId, selectedEdgeId } = useDiagramStore.getState();
      expect(selectedNodeId).toBe('state-0');
      expect(selectedEdgeId).toBeNull();
    });

    it('selectEdge sets edge and clears node', () => {
      useDiagramStore.setState({ selectedNodeId: 'state-0' });

      const { selectEdge } = useDiagramStore.getState();
      selectEdge('e0');

      const { selectedNodeId, selectedEdgeId } = useDiagramStore.getState();
      expect(selectedNodeId).toBeNull();
      expect(selectedEdgeId).toBe('e0');
    });

    it('clearSelection clears both', () => {
      useDiagramStore.setState({ selectedNodeId: 'state-0', selectedEdgeId: 'e0' });

      const { clearSelection } = useDiagramStore.getState();
      clearSelection();

      const { selectedNodeId, selectedEdgeId } = useDiagramStore.getState();
      expect(selectedNodeId).toBeNull();
      expect(selectedEdgeId).toBeNull();
    });
  });
});

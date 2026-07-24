import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDiagramStore } from '../../../src/stores/diagramStore';
import { executeToolCall } from '../../../src/lib/chatToolExecutor';
import type { ToolCall } from '../../../src/stores/chatStore';

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

const call = (name: string, input: Record<string, unknown> = {}): ToolCall => ({
  id: `tc-${name}`,
  name,
  input,
});

/** Run a tool call against the current store state (as ChatPanel does). */
function run(name: string, input: Record<string, unknown> = {}): void {
  executeToolCall(call(name, input), useDiagramStore.getState());
}

describe('chatToolExecutor', () => {
  beforeEach(() => {
    useDiagramStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      nodeCounter: 0,
      edgeCounter: 0,
    });
  });

  describe('add_node', () => {
    it('adds a node at the given position with label and properties applied', () => {
      run('add_node', {
        subType: 'failed',
        label: 'Pump down',
        positionX: 300,
        positionY: 50,
        properties: { failureRate: '0.001' },
      });

      const { nodes, nodeCounter } = useDiagramStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].position).toEqual({ x: 300, y: 50 });
      expect(nodes[0].data.label).toBe('Pump down');
      expect(nodes[0].data.failureRate).toBe('0.001');
      expect(nodes[0].data.stateType).toBe('failed');
      expect(nodeCounter).toBe(1);
    });

    it('auto-positions: 100,100 on an empty canvas, then maxX+200', () => {
      run('add_node', { subType: 'operational' });
      expect(useDiagramStore.getState().nodes[0].position).toEqual({ x: 100, y: 100 });

      run('add_node', { subType: 'operational' });
      const second = useDiagramStore.getState().nodes[1];
      expect(second.position.x).toBe(300); // 100 + 200
    });

    it('keeps the generated label when none is provided', () => {
      run('add_node', { subType: 'operational' });
      expect(useDiagramStore.getState().nodes[0].data.label).toBe('S0');
    });
  });

  describe('add_edge', () => {
    beforeEach(() => {
      run('add_node', { subType: 'operational' }); // state-0 / S0
      run('add_node', { subType: 'failed', label: 'Down' }); // state-1 / Down
    });

    it('connects two nodes by id and increments the edge counter', () => {
      run('add_edge', { source: 'state-0', target: 'state-1' });

      const { edges, edgeCounter } = useDiagramStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('state-0');
      expect(edges[0].target).toBe('state-1');
      expect(edgeCounter).toBe(1);
    });

    it('resolves nodes by label and applies label + properties to the edge', () => {
      run('add_edge', { source: 'S0', target: 'Down', label: 'λ', properties: { rate: '0.01' } });

      const { edges } = useDiagramStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].source).toBe('state-0');
      expect(edges[0].target).toBe('state-1');
      expect(edges[0].data?.label).toBe('λ');
      expect(edges[0].data?.rate).toBe('0.01');
    });

    it('does nothing when the source node cannot be resolved', () => {
      run('add_edge', { source: 'no-such-node', target: 'state-1' });
      expect(useDiagramStore.getState().edges).toHaveLength(0);
      expect(useDiagramStore.getState().edgeCounter).toBe(0);
    });
  });

  describe('remove_node', () => {
    it('removes the node and its connected edges (resolved by label)', () => {
      run('add_node', { subType: 'operational' });
      run('add_node', { subType: 'failed', label: 'Down' });
      run('add_edge', { source: 'state-0', target: 'state-1' });

      run('remove_node', { nodeId: 'Down' });

      const { nodes, edges } = useDiagramStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('state-0');
      expect(edges).toHaveLength(0); // connected edge removed too
    });

    it('does nothing for an unknown reference', () => {
      run('add_node', { subType: 'operational' });
      run('remove_node', { nodeId: 'ghost' });
      expect(useDiagramStore.getState().nodes).toHaveLength(1);
    });
  });

  describe('remove_edge', () => {
    it('removes the edge by id', () => {
      run('add_node', { subType: 'operational' });
      run('add_node', { subType: 'failed' });
      run('add_edge', { source: 'state-0', target: 'state-1' });

      run('remove_edge', { edgeId: 'transition-0' });
      expect(useDiagramStore.getState().edges).toHaveLength(0);
    });
  });

  describe('update_node / update_edge', () => {
    it('updates node data, resolving the node by label', () => {
      run('add_node', { subType: 'operational' });
      run('update_node', { nodeId: 'S0', changes: { label: 'Healthy', failureRate: '1e-4' } });

      const node = useDiagramStore.getState().nodes[0];
      expect(node.data.label).toBe('Healthy');
      expect(node.data.failureRate).toBe('1e-4');
    });

    it('updates edge data by id', () => {
      run('add_node', { subType: 'operational' });
      run('add_node', { subType: 'failed' });
      run('add_edge', { source: 'state-0', target: 'state-1' });

      run('update_edge', { edgeId: 'transition-0', changes: { rate: '0.5' } });
      expect(useDiagramStore.getState().edges[0].data?.rate).toBe('0.5');
    });
  });

  describe('clear_diagram', () => {
    it('empties the canvas and resets both counters', () => {
      run('add_node', { subType: 'operational' });
      run('add_node', { subType: 'failed' });
      run('add_edge', { source: 'state-0', target: 'state-1' });

      run('clear_diagram');

      const { nodes, edges, nodeCounter, edgeCounter } = useDiagramStore.getState();
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
      expect(nodeCounter).toBe(0);
      expect(edgeCounter).toBe(0);
    });
  });

  it('ignores unknown tool names without touching state', () => {
    run('add_node', { subType: 'operational' });
    run('totally_unknown_tool', { whatever: true });
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });
});

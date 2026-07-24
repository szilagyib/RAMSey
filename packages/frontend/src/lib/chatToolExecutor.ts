import type { ToolCall } from '../stores/chatStore';
import { useDiagramStore } from '../stores/diagramStore';
import { getDiagramTypeConfig } from '../diagram-types/registry';

// ---------------------------------------------------------------------------
// Tool executor — applies AI tool calls to the diagram store. Extracted from
// ChatPanel so the diagram-mutation logic is unit-testable in isolation.
// ---------------------------------------------------------------------------

/** Tool calls that mutate the diagram — each becomes ONE undo entry. */
const MUTATING_TOOLS = new Set([
  'add_node',
  'add_edge',
  'remove_node',
  'remove_edge',
  'update_node',
  'update_edge',
  'clear_diagram',
]);

export function executeToolCall(
  toolCall: ToolCall,
  diagramStore: ReturnType<typeof useDiagramStore.getState>,
): void {
  if (MUTATING_TOOLS.has(toolCall.name)) {
    // Group the tool call's internal mutations (e.g. add_node = create +
    // label/props update) so undo reverts the whole call at once.
    useDiagramStore.getState().runInHistoryEntry(() => applyToolCall(toolCall, diagramStore));
  } else {
    applyToolCall(toolCall, diagramStore);
  }
}

function applyToolCall(
  toolCall: ToolCall,
  diagramStore: ReturnType<typeof useDiagramStore.getState>,
): void {
  const { name, input } = toolCall;

  switch (name) {
    case 'add_node': {
      const subType = input.subType as string;
      const label = input.label as string | undefined;
      const x = (input.positionX as number) ?? calcNextX(diagramStore.nodes);
      const y = (input.positionY as number) ?? calcNextY(diagramStore.nodes);
      const properties = (input.properties ?? {}) as Record<string, unknown>;

      diagramStore.addNode({ x, y }, subType);

      // After adding, update the node with custom label and properties
      const newNodes = useDiagramStore.getState().nodes;
      const newNode = newNodes[newNodes.length - 1];
      if (newNode) {
        const updates: Record<string, unknown> = { ...properties };
        if (label) updates.label = label;
        if (Object.keys(updates).length > 0) {
          useDiagramStore.getState().updateNodeData(newNode.id, updates);
        }
      }
      break;
    }

    case 'add_edge': {
      const sourceRef = input.source as string;
      const targetRef = input.target as string;
      const label = input.label as string | undefined;
      const properties = (input.properties ?? {}) as Record<string, unknown>;

      const sourceNode = findNode(diagramStore.nodes, sourceRef);
      const targetNode = findNode(diagramStore.nodes, targetRef);

      if (sourceNode && targetNode) {
        const config = getDiagramTypeConfig(diagramStore.diagramType);
        if (config) {
          const edgeCounter = diagramStore.edgeCounter;
          const newEdge = config.createEdge(sourceNode.id, targetNode.id, edgeCounter);

          const edgeData: Record<string, unknown> = {
            ...((newEdge.data as Record<string, unknown>) ?? {}),
            ...properties,
          };
          if (label) edgeData.label = label;

          useDiagramStore.setState((state) => ({
            edges: [...state.edges, { ...newEdge, data: edgeData }],
            edgeCounter: state.edgeCounter + 1,
          }));
        }
      }
      break;
    }

    case 'remove_node': {
      const nodeRef = input.nodeId as string;
      const node = findNode(diagramStore.nodes, nodeRef);
      if (node) {
        useDiagramStore.setState((state) => ({
          nodes: state.nodes.filter((n) => n.id !== node.id),
          edges: state.edges.filter((e) => e.source !== node.id && e.target !== node.id),
        }));
      }
      break;
    }

    case 'remove_edge': {
      const edgeId = input.edgeId as string;
      useDiagramStore.setState((state) => ({
        edges: state.edges.filter((e) => e.id !== edgeId),
      }));
      break;
    }

    case 'update_node': {
      const nodeRef = input.nodeId as string;
      const changes = (input.changes ?? {}) as Record<string, unknown>;
      const node = findNode(diagramStore.nodes, nodeRef);
      if (node) {
        useDiagramStore.getState().updateNodeData(node.id, changes);
      }
      break;
    }

    case 'update_edge': {
      const edgeId = input.edgeId as string;
      const changes = (input.changes ?? {}) as Record<string, unknown>;
      useDiagramStore.getState().updateEdgeData(edgeId, changes);
      break;
    }

    case 'clear_diagram': {
      useDiagramStore.setState({
        nodes: [],
        edges: [],
        nodeCounter: 0,
        edgeCounter: 0,
      });
      break;
    }
  }
}

function findNode(nodes: Array<{ id: string; data: Record<string, unknown> }>, ref: string) {
  return nodes.find((n) => n.id === ref) || nodes.find((n) => (n.data?.label as string) === ref);
}

function calcNextX(nodes: Array<{ position: { x: number } }>): number {
  if (nodes.length === 0) return 100;
  const maxX = Math.max(...nodes.map((n) => n.position.x));
  return maxX + 200;
}

function calcNextY(nodes: Array<{ position: { y: number } }>): number {
  if (nodes.length === 0) return 100;
  // Stagger vertically
  return 100 + (nodes.length % 3) * 150;
}

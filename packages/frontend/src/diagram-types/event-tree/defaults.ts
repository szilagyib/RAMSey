import type { Node, Edge } from '@xyflow/react';
import type { EventTreeNodeData, EventTreeEdgeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Sub-types and their corresponding React Flow node type keys
// ---------------------------------------------------------------------------

type EventTreeNodeSubType = EventTreeNodeData['nodeKind'];

const NODE_TYPE_MAP: Record<EventTreeNodeSubType, string> = {
  initiating_event: 'initiatingEventNode',
  header: 'headerNode',
  consequence: 'consequenceNode',
};

const NODE_PREFIX_MAP: Record<EventTreeNodeSubType, string> = {
  initiating_event: 'ie',
  header: 'hdr',
  consequence: 'csq',
};

const NODE_LABEL_MAP: Record<EventTreeNodeSubType, string> = {
  initiating_event: 'IE',
  header: 'H',
  consequence: 'C',
};

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

export const DEFAULT_NODE_DATA: Record<EventTreeNodeSubType, Omit<EventTreeNodeData, 'label'>> = {
  initiating_event: { nodeKind: 'initiating_event' },
  header: { nodeKind: 'header' },
  consequence: { nodeKind: 'consequence' },
};

export const DEFAULT_EDGE_DATA: EventTreeEdgeData = {
  label: '',
  branchType: 'success',
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createNode(
  position: { x: number; y: number },
  counter: number,
  subType?: string,
): Node<EventTreeNodeData> {
  const kind = (subType ?? 'header') as EventTreeNodeSubType;
  return {
    id: `${NODE_PREFIX_MAP[kind] ?? 'et'}-${counter}`,
    type: NODE_TYPE_MAP[kind] ?? 'headerNode',
    position,
    data: {
      ...DEFAULT_NODE_DATA[kind],
      label: `${NODE_LABEL_MAP[kind] ?? 'N'}${counter}`,
    } as EventTreeNodeData,
  };
}

export function createEdge(
  source: string,
  target: string,
  counter: number,
  subType?: string,
): Edge<EventTreeEdgeData> {
  return {
    id: `branch-${counter}`,
    type: 'branchEdge',
    source,
    target,
    data: {
      ...DEFAULT_EDGE_DATA,
      branchType: (subType as EventTreeEdgeData['branchType']) ?? 'success',
    },
  };
}

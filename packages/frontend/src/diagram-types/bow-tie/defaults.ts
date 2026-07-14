import type { Node, Edge } from '@xyflow/react';
import type { BowTieNodeData, BowTieEdgeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Sub-type to node-type mapping
// ---------------------------------------------------------------------------

const subTypeToNodeType: Record<BowTieNodeData['nodeKind'], string> = {
  threat: 'threatNode',
  preventive_barrier: 'barrierNode',
  top_event: 'topEventNode',
  mitigative_barrier: 'barrierNode',
  consequence: 'consequenceNode',
};

// ---------------------------------------------------------------------------
// Default labels per sub-type
// ---------------------------------------------------------------------------

const defaultLabels: Record<BowTieNodeData['nodeKind'], string> = {
  threat: 'Threat',
  preventive_barrier: 'Prev. Barrier',
  top_event: 'Top Event',
  mitigative_barrier: 'Mit. Barrier',
  consequence: 'Consequence',
};

// ---------------------------------------------------------------------------
// Default data for each node kind
// ---------------------------------------------------------------------------

export const DEFAULT_NODE_DATA: Record<
  BowTieNodeData['nodeKind'],
  Omit<BowTieNodeData, 'label'>
> = {
  threat: { nodeKind: 'threat', probability: '' },
  preventive_barrier: { nodeKind: 'preventive_barrier', effectiveness: '' },
  top_event: { nodeKind: 'top_event' },
  mitigative_barrier: { nodeKind: 'mitigative_barrier', effectiveness: '' },
  consequence: { nodeKind: 'consequence' },
};

export const DEFAULT_EDGE_DATA: BowTieEdgeData = {
  label: '',
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createNode(
  position: { x: number; y: number },
  counter: number,
  subType?: string,
): Node<BowTieNodeData> {
  const kind = (subType ?? 'threat') as BowTieNodeData['nodeKind'];
  return {
    id: `bt-${kind}-${counter}`,
    type: subTypeToNodeType[kind] ?? 'threatNode',
    position,
    data: {
      ...DEFAULT_NODE_DATA[kind],
      label: `${defaultLabels[kind] ?? 'Node'} ${counter}`,
    } as BowTieNodeData,
  };
}

export function createEdge(
  source: string,
  target: string,
  counter: number,
): Edge<BowTieEdgeData> {
  return {
    id: `bt-edge-${counter}`,
    type: 'flowEdge',
    source,
    target,
    data: { ...DEFAULT_EDGE_DATA },
  };
}

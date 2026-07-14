import type { Node, Edge } from '@xyflow/react';
import type { RBDNodeData, RBDEdgeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Sub-type definitions
// ---------------------------------------------------------------------------

export type RBDSubType = 'block' | 'input_terminal' | 'output_terminal';

// ---------------------------------------------------------------------------
// Default data for each sub-type
// ---------------------------------------------------------------------------

export const DEFAULT_NODE_DATA: Record<RBDSubType, Omit<RBDNodeData, 'label'>> = {
  block: { nodeKind: 'block', failureRate: '', repairRate: '' },
  input_terminal: { nodeKind: 'input_terminal' },
  output_terminal: { nodeKind: 'output_terminal' },
};

export const DEFAULT_EDGE_DATA: RBDEdgeData = {
  label: '',
};

// ---------------------------------------------------------------------------
// Node-type mapping
// ---------------------------------------------------------------------------

const nodeTypeMap: Record<RBDSubType, string> = {
  block: 'blockNode',
  input_terminal: 'terminalNode',
  output_terminal: 'terminalNode',
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createNode(
  position: { x: number; y: number },
  counter: number,
  subType?: string,
): Node<RBDNodeData> {
  const kind = (subType ?? 'block') as RBDSubType;
  const labelMap: Record<RBDSubType, string> = {
    block: `B${counter}`,
    input_terminal: 'IN',
    output_terminal: 'OUT',
  };

  return {
    id: `rbd-${kind}-${counter}`,
    type: nodeTypeMap[kind] ?? 'blockNode',
    position,
    data: {
      ...DEFAULT_NODE_DATA[kind],
      label: labelMap[kind] ?? `N${counter}`,
    } as RBDNodeData,
  };
}

export function createEdge(source: string, target: string, counter: number): Edge<RBDEdgeData> {
  return {
    id: `rbd-edge-${counter}`,
    type: 'connectionEdge',
    source,
    target,
    data: { ...DEFAULT_EDGE_DATA },
  };
}

import type { Node, Edge } from '@xyflow/react';
import type { FaultTreeNodeData, FaultTreeEdgeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Sub-type definitions
// ---------------------------------------------------------------------------

export type GateSubType = 'and_gate' | 'or_gate' | 'not_gate' | 'k_of_n_gate' | 'xor_gate';

export type EventSubType = 'basic_event' | 'intermediate_event' | 'top_event' | 'undeveloped_event';

export type FaultTreeSubType = GateSubType | EventSubType;

// ---------------------------------------------------------------------------
// Gate sub-type to data mapping
// ---------------------------------------------------------------------------

const GATE_SUBTYPES: Record<GateSubType, Omit<FaultTreeNodeData, 'label'>> = {
  and_gate: { nodeKind: 'gate', gateType: 'AND' },
  or_gate: { nodeKind: 'gate', gateType: 'OR' },
  not_gate: { nodeKind: 'gate', gateType: 'NOT' },
  k_of_n_gate: { nodeKind: 'gate', gateType: 'K_OF_N', k: 1 },
  xor_gate: { nodeKind: 'gate', gateType: 'XOR' },
};

// ---------------------------------------------------------------------------
// Event sub-type to data mapping
// ---------------------------------------------------------------------------

const EVENT_SUBTYPES: Record<EventSubType, Omit<FaultTreeNodeData, 'label'>> = {
  basic_event: { nodeKind: 'event', eventType: 'basic', probability: '' },
  intermediate_event: { nodeKind: 'event', eventType: 'intermediate' },
  top_event: { nodeKind: 'event', eventType: 'top' },
  undeveloped_event: { nodeKind: 'event', eventType: 'undeveloped' },
};

// ---------------------------------------------------------------------------
// Default edge data
// ---------------------------------------------------------------------------

export const DEFAULT_EDGE_DATA: FaultTreeEdgeData = {
  label: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGateSubType(subType: FaultTreeSubType): subType is GateSubType {
  return subType in GATE_SUBTYPES;
}

function getNodeType(subType: FaultTreeSubType): string {
  return isGateSubType(subType) ? 'gateNode' : 'eventNode';
}

function getLabelPrefix(subType: FaultTreeSubType): string {
  if (isGateSubType(subType)) {
    const gateType = GATE_SUBTYPES[subType].gateType;
    return `${gateType}`;
  }
  const eventType = EVENT_SUBTYPES[subType as EventSubType].eventType;
  switch (eventType) {
    case 'basic':
      return 'BE';
    case 'intermediate':
      return 'IE';
    case 'top':
      return 'TE';
    case 'undeveloped':
      return 'UE';
    default:
      return 'E';
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createNode(
  position: { x: number; y: number },
  counter: number,
  subType?: string,
): Node<FaultTreeNodeData> {
  const st = (subType ?? 'basic_event') as FaultTreeSubType;
  const isGate = isGateSubType(st);
  const defaults = isGate ? GATE_SUBTYPES[st as GateSubType] : EVENT_SUBTYPES[st as EventSubType];

  return {
    id: `ft-node-${counter}`,
    type: getNodeType(st),
    position,
    data: {
      ...defaults,
      label: `${getLabelPrefix(st)}${counter}`,
    } as FaultTreeNodeData,
  };
}

export function createEdge(
  source: string,
  target: string,
  counter: number,
): Edge<FaultTreeEdgeData> {
  return {
    id: `ft-edge-${counter}`,
    type: 'treeEdge',
    source,
    target,
    data: { ...DEFAULT_EDGE_DATA },
  };
}

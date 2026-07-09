import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { ThreatNode } from './nodes/ThreatNode';
import { BarrierNode } from './nodes/BarrierNode';
import { TopEventNode } from './nodes/TopEventNode';
import { ConsequenceNode } from './nodes/ConsequenceNode';
import { FlowEdge } from './edges/FlowEdge';

export const nodeTypes: NodeTypes = {
  threatNode: ThreatNode,
  barrierNode: BarrierNode,
  topEventNode: TopEventNode,
  consequenceNode: ConsequenceNode,
};

export const edgeTypes: EdgeTypes = {
  flowEdge: FlowEdge,
};

export const config = {
  id: 'bow_tie' as const,
  name: 'Bow-Tie',
  description: 'Bow-tie diagram linking threats through barriers to a top event and consequences',
  nodeTypes,
  edgeTypes,
};

export { createNode, createEdge, DEFAULT_NODE_DATA, DEFAULT_EDGE_DATA } from './defaults';
export { validate } from './validation';

import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { GateNode } from './nodes/GateNode';
import { EventNode } from './nodes/EventNode';
import { TreeEdge } from './edges/TreeEdge';

export const nodeTypes: NodeTypes = {
  gateNode: GateNode,
  eventNode: EventNode,
};

export const edgeTypes: EdgeTypes = {
  treeEdge: TreeEdge,
};

export const config = {
  id: 'fault_tree',
  label: 'Fault Tree',
  nodeTypes,
  edgeTypes,
} as const;

export { createNode, createEdge, DEFAULT_EDGE_DATA } from './defaults';
export type { FaultTreeSubType, GateSubType, EventSubType } from './defaults';
export { validate } from './validation';

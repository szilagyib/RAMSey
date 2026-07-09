import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { InitiatingEventNode } from './nodes/InitiatingEventNode';
import { HeaderNode } from './nodes/HeaderNode';
import { ConsequenceNode } from './nodes/ConsequenceNode';
import { BranchEdge } from './edges/BranchEdge';

export const nodeTypes: NodeTypes = {
  initiatingEventNode: InitiatingEventNode,
  headerNode: HeaderNode,
  consequenceNode: ConsequenceNode,
};

export const edgeTypes: EdgeTypes = {
  branchEdge: BranchEdge,
};

export const config = {
  id: 'event_tree' as const,
  name: 'Event Tree',
  description: 'Event tree analysis with initiating events, headers, and consequence branches',
  nodeTypes,
  edgeTypes,
};

export { createNode, createEdge, DEFAULT_NODE_DATA, DEFAULT_EDGE_DATA } from './defaults';
export { validate } from './validation';

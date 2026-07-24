import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { BlockNode } from './nodes/BlockNode';
import { TerminalNode } from './nodes/TerminalNode';
import { ConnectionEdge } from './edges/ConnectionEdge';

export const nodeTypes: NodeTypes = {
  blockNode: BlockNode,
  terminalNode: TerminalNode,
};

export const edgeTypes: EdgeTypes = {
  connectionEdge: ConnectionEdge,
};

export const config = {
  id: 'rbd' as const,
  name: 'RBD',
  description: 'System reliability model using series/parallel block configurations',
  nodeTypes,
  edgeTypes,
};

export { createNode, createEdge, DEFAULT_NODE_DATA, DEFAULT_EDGE_DATA } from './defaults';
export { validate } from './validation';

import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { StateNode } from './nodes/StateNode';
import { TransitionEdge } from './edges/TransitionEdge';

export const nodeTypes: NodeTypes = {
  stateNode: StateNode,
};

export const edgeTypes: EdgeTypes = {
  transitionEdge: TransitionEdge,
};

export { createNewState, createNewTransition, DEFAULT_STATE_DATA, DEFAULT_EDGE_DATA } from './defaults';
export { validateMarkovDiagram } from './validation';

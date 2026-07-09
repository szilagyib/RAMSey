import type { NodeTypes, EdgeTypes } from '@xyflow/react';

export const nodeTypes: NodeTypes = {};
export const edgeTypes: EdgeTypes = {};

export const config = {
  id: 'fmea' as const,
  name: 'FMEA',
  description: 'Failure Mode and Effects Analysis table',
  nodeTypes,
  edgeTypes,
  isTableBased: true,
};

export { FMEAEditor } from './FMEAEditor';
export { validate } from './validation';

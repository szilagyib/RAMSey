import type { Node, Edge } from '@xyflow/react';
import type { MarkovNodeData, MarkovEdgeData } from '../../types/diagram';
import { hasOwnKey } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Default data for each state type
// ---------------------------------------------------------------------------

export const DEFAULT_STATE_DATA: Record<
  MarkovNodeData['stateType'],
  Omit<MarkovNodeData, 'label'>
> = {
  operational: { stateType: 'operational', isInitial: false },
  degraded: { stateType: 'degraded', isInitial: false },
  failed: { stateType: 'failed', isInitial: false },
  absorbing: { stateType: 'absorbing', isInitial: false },
};

export const DEFAULT_EDGE_DATA: MarkovEdgeData = {
  rate: '',
  probability: '',
  label: '',
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createNewState(
  position: { x: number; y: number },
  counter: number,
  stateType: MarkovNodeData['stateType'] = 'operational',
): Node<MarkovNodeData> {
  return {
    id: `state-${counter}`,
    type: 'stateNode',
    position,
    data: {
      label: `S${counter}`,
      stateType,
      isInitial: counter === 0,
    },
  };
}

export function createNewTransition(
  source: string,
  target: string,
  counter: number,
): Edge<MarkovEdgeData> {
  return {
    id: `transition-${counter}`,
    type: 'transitionEdge',
    source,
    target,
    data: { ...DEFAULT_EDGE_DATA },
  };
}

// Generic interface wrappers used by the registry
export function createNode(
  position: { x: number; y: number },
  counter: number,
  subType?: string,
): Node<MarkovNodeData> {
  // An unknown sub-type (an AI tool call can name one) gets the default state,
  // rather than being stored as a state type nothing else recognises.
  const stateType: MarkovNodeData['stateType'] =
    subType !== undefined && hasOwnKey(DEFAULT_STATE_DATA, subType) ? subType : 'operational';
  return createNewState(position, counter, stateType);
}

export function createEdge(source: string, target: string, counter: number): Edge<MarkovEdgeData> {
  return createNewTransition(source, target, counter);
}

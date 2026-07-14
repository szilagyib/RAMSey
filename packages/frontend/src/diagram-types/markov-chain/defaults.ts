import type { Node, Edge } from '@xyflow/react';
import type { MarkovNodeData, MarkovEdgeData } from '../../types/diagram';

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
  return createNewState(
    position,
    counter,
    (subType as MarkovNodeData['stateType']) ?? 'operational',
  );
}

export function createEdge(source: string, target: string, counter: number): Edge<MarkovEdgeData> {
  return createNewTransition(source, target, counter);
}

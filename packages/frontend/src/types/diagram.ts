import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Markov chain node data
// ---------------------------------------------------------------------------

export interface MarkovNodeData {
  label: string;
  stateType: 'operational' | 'degraded' | 'failed' | 'absorbing';
  isInitial: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Markov chain edge data
// ---------------------------------------------------------------------------

export interface MarkovEdgeData {
  rate: string;
  probability: string;
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Fault Tree
// ---------------------------------------------------------------------------

export interface FaultTreeNodeData {
  label: string;
  nodeKind: 'gate' | 'event';
  gateType?: 'AND' | 'OR' | 'NOT' | 'K_OF_N' | 'XOR';
  eventType?: 'basic' | 'intermediate' | 'top' | 'undeveloped';
  k?: number;
  probability?: string;
  [key: string]: unknown;
}

export interface FaultTreeEdgeData {
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Event Tree
// ---------------------------------------------------------------------------

export interface EventTreeNodeData {
  label: string;
  nodeKind: 'initiating_event' | 'header' | 'consequence';
  probability?: string;
  description?: string;
  [key: string]: unknown;
}

export interface EventTreeEdgeData {
  label: string;
  branchType: 'success' | 'failure';
  probability?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reliability Block Diagram
// ---------------------------------------------------------------------------

export interface RBDNodeData {
  label: string;
  nodeKind: 'block' | 'input_terminal' | 'output_terminal';
  failureRate?: string;
  repairRate?: string;
  [key: string]: unknown;
}

export interface RBDEdgeData {
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bow-Tie
// ---------------------------------------------------------------------------

export interface BowTieNodeData {
  label: string;
  nodeKind: 'threat' | 'preventive_barrier' | 'top_event' | 'mitigative_barrier' | 'consequence';
  effectiveness?: string;
  /** Likelihood of a threat being realised. The solver defaults it to 1 (i.e.
   *  certain) when absent, which makes every top-event frequency meaningless. */
  probability?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BowTieEdgeData {
  label: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// FMEA
// ---------------------------------------------------------------------------

export interface FMEARow {
  id: string;
  item: string;
  function: string;
  failureMode: string;
  effect: string;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  actions: string;
}

// ---------------------------------------------------------------------------
// Diagram state (frontend view model)
// ---------------------------------------------------------------------------

export interface DiagramState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

// ---------------------------------------------------------------------------
// Type aliases for convenience
// ---------------------------------------------------------------------------

export type MarkovNode = Node<MarkovNodeData>;
export type MarkovEdge = Edge<MarkovEdgeData>;

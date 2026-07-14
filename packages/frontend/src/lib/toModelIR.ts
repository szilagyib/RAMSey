import type { Node, Edge } from '@xyflow/react';
import { createDefaultModelIR, type ModelIR } from '@ramsey/engine';
import type {
  MarkovNodeData,
  MarkovEdgeData,
  FaultTreeNodeData,
  RBDNodeData,
  EventTreeNodeData,
  EventTreeEdgeData,
  BowTieNodeData,
} from '../types/diagram';

/** Parse a string/number field to a finite number, or undefined if blank/invalid. */
function parseNum(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Convert a Markov-chain canvas (React Flow nodes/edges) into the engine ModelIR.
 * States map 1:1 from nodes; transitions from edges (rate/probability parsed from
 * their string fields). The `isInitial` node becomes the single initial condition.
 */
export function markovToModelIR(nodes: Node[], edges: Edge[], missionTime: number): ModelIR {
  const ir = createDefaultModelIR('markov_chain');
  ir.missionTime = missionTime;

  ir.states = nodes.map((n) => {
    const d = n.data as MarkovNodeData;
    return {
      id: n.id,
      label: d.label ?? n.id,
      type: d.stateType ?? 'operational',
      position: n.position,
    };
  });

  const initial = nodes.find((n) => (n.data as MarkovNodeData).isInitial) ?? nodes[0];
  ir.initialCondition = { type: 'single', stateId: initial?.id ?? '' };

  ir.transitions = edges.map((e) => {
    const d = (e.data ?? {}) as MarkovEdgeData;
    const rate = parseNum(d.rate);
    const probability = parseNum(d.probability);
    return {
      id: e.id,
      from: e.source,
      to: e.target,
      ...(rate !== undefined ? { rate } : {}),
      ...(probability !== undefined ? { probability } : {}),
      ...(d.label ? { label: d.label } : {}),
    };
  });

  return ir;
}

/**
 * Convert a fault-tree canvas into the engine ModelIR. Edges flow input → gate
 * → … → top, so a gate's inputs are the sources of edges targeting it and its
 * output is the node it points to.
 */
export function faultTreeToModelIR(nodes: Node[], edges: Edge[]): ModelIR {
  const ir = createDefaultModelIR('fault_tree');
  const predecessors = (id: string) => edges.filter((e) => e.target === id).map((e) => e.source);
  const successors = (id: string) => edges.filter((e) => e.source === id).map((e) => e.target);

  ir.events = nodes
    .filter((n) => (n.data as FaultTreeNodeData).nodeKind === 'event')
    .map((n) => {
      const d = n.data as FaultTreeNodeData;
      const prob = parseNum(d.probability);
      return {
        id: n.id,
        name: d.label ?? n.id,
        type: d.eventType ?? 'basic',
        ...(prob !== undefined ? { probability: prob } : {}),
      };
    });

  ir.gates = nodes
    .filter((n) => (n.data as FaultTreeNodeData).nodeKind === 'gate')
    .map((n) => {
      const d = n.data as FaultTreeNodeData;
      return {
        id: n.id,
        type: d.gateType ?? 'OR',
        ...(d.k !== undefined ? { k: d.k } : {}),
        inputs: predecessors(n.id),
        output: successors(n.id)[0] ?? n.id,
      };
    });

  return ir;
}

// ---------------------------------------------------------------------------
// RBD: emit a general two-terminal network (any topology, incl. non-SP).
// The engine computes reliability via minimal path sets + inclusion-exclusion.
// ---------------------------------------------------------------------------

/**
 * Convert an RBD canvas into the engine ModelIR as a two-terminal network.
 * Components come from block nodes; connections from canvas edges; source/sink
 * are the terminals. Returns null only if a terminal is missing.
 */
export function rbdToModelIR(nodes: Node[], edges: Edge[], missionTime: number): ModelIR | null {
  const input = nodes.find((n) => (n.data as RBDNodeData).nodeKind === 'input_terminal');
  const output = nodes.find((n) => (n.data as RBDNodeData).nodeKind === 'output_terminal');
  const blocks = nodes.filter((n) => (n.data as RBDNodeData).nodeKind === 'block');
  if (!input || !output) return null;

  const ir = createDefaultModelIR('reliability_block_diagram');
  ir.missionTime = missionTime;
  ir.components = blocks.map((b) => {
    const d = b.data as RBDNodeData;
    const fr = parseNum(d.failureRate);
    const rr = parseNum(d.repairRate);
    return {
      id: b.id,
      name: d.label ?? b.id,
      ...(fr !== undefined ? { failureRate: fr } : {}),
      ...(rr !== undefined ? { repairRate: rr } : {}),
      metadata: {},
    };
  });
  ir.rbdNetwork = {
    source: input.id,
    sink: output.id,
    connections: edges.map((e) => ({ from: e.source, to: e.target })),
  };

  return ir;
}

// ---------------------------------------------------------------------------
// Event tree → event-tree structure (branch probabilities from edges).
// ---------------------------------------------------------------------------

/**
 * Convert an event-tree canvas into the engine ModelIR. The initiating-event
 * node is the root; canvas edges become branches carrying their probability.
 * Returns null if there is no initiating event.
 */
export function eventTreeToModelIR(nodes: Node[], edges: Edge[]): ModelIR | null {
  const initiating = nodes.find((n) => (n.data as EventTreeNodeData).nodeKind === 'initiating_event');
  if (!initiating) return null;

  const labels: Record<string, string> = {};
  for (const n of nodes) labels[n.id] = (n.data as EventTreeNodeData).label ?? n.id;

  const ir = createDefaultModelIR('event_tree');
  ir.eventTree = {
    initiatingId: initiating.id,
    initiatingProbability: parseNum((initiating.data as EventTreeNodeData).probability) ?? 1,
    branches: edges.map((e) => {
      const d = (e.data ?? {}) as EventTreeEdgeData;
      const probability = parseNum(d.probability);
      return {
        from: e.source,
        to: e.target,
        ...(probability !== undefined ? { probability } : {}),
        ...(d.branchType ? { branchType: d.branchType } : {}),
      };
    }),
    labels,
  };

  return ir;
}

// ---------------------------------------------------------------------------
// Bow-tie → bow-tie structure (barriers carry effectiveness).
// ---------------------------------------------------------------------------

/**
 * Convert a bow-tie canvas into the engine ModelIR. The central top-event node
 * anchors the structure; barrier nodes carry their effectiveness. Returns null
 * if there is no top event.
 */
export function bowTieToModelIR(nodes: Node[], edges: Edge[]): ModelIR | null {
  const top = nodes.find((n) => (n.data as BowTieNodeData).nodeKind === 'top_event');
  if (!top) return null;

  const labels: Record<string, string> = {};
  for (const n of nodes) labels[n.id] = (n.data as BowTieNodeData).label ?? n.id;

  const ir = createDefaultModelIR('bow_tie');
  ir.bowTie = {
    topEventId: top.id,
    nodes: nodes.map((n) => {
      const d = n.data as BowTieNodeData;
      const eff = parseNum(d.effectiveness);
      // Threat likelihood. Without it the solver falls back to 1 — every threat
      // certain to occur — so the top-event frequency was never really a result.
      const prob = parseNum(d.probability);
      return {
        id: n.id,
        kind: d.nodeKind,
        ...(eff !== undefined ? { effectiveness: eff } : {}),
        ...(prob !== undefined ? { probability: prob } : {}),
      };
    }),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
    labels,
  };

  return ir;
}

import type { Node, Edge } from '@xyflow/react';
import type { ValidationResult } from '@ramsey/engine';
import type { FaultTreeNodeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

function addError(
  result: ValidationResult,
  code: string,
  message: string,
  affectedIds: string[],
): void {
  result.errors.push({ code, message, affectedIds });
  result.valid = false;
}

function addWarning(
  result: ValidationResult,
  code: string,
  message: string,
  affectedIds: string[],
): void {
  result.warnings.push({ code, message, affectedIds });
}

// ---------------------------------------------------------------------------
// Validate fault tree diagram
// ---------------------------------------------------------------------------

export function validate(nodes: Node[], edges: Edge[]): ValidationResult {
  const result = emptyResult();

  // --- Empty diagram ---
  if (nodes.length === 0) {
    addError(result, 'EMPTY_DIAGRAM', 'Diagram has no nodes. Add at least one node.', []);
    return result;
  }

  // --- Exactly one top event ---
  const topEvents = nodes.filter(
    (n) => (n.data as FaultTreeNodeData).eventType === 'top',
  );

  if (topEvents.length === 0) {
    addError(
      result,
      'NO_TOP_EVENT',
      'Fault tree must have exactly one top event. No top event found.',
      [],
    );
  } else if (topEvents.length > 1) {
    addError(
      result,
      'MULTIPLE_TOP_EVENTS',
      `Fault tree must have exactly one top event. Found ${topEvents.length}.`,
      topEvents.map((n) => n.id),
    );
  }

  // --- Gates must have at least one input (incoming edge) ---
  const gateNodes = nodes.filter(
    (n) => (n.data as FaultTreeNodeData).nodeKind === 'gate',
  );

  const incomingByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge.source);
    incomingByTarget.set(edge.target, list);
  }

  for (const gate of gateNodes) {
    const inputs = incomingByTarget.get(gate.id) ?? [];
    const gateData = gate.data as FaultTreeNodeData;

    if (inputs.length === 0) {
      addError(
        result,
        'GATE_NO_INPUTS',
        `Gate "${gateData.label || gate.id}" has no input connections.`,
        [gate.id],
      );
    }

    // NOT gate should have exactly 1 input
    if (gateData.gateType === 'NOT' && inputs.length > 1) {
      addWarning(
        result,
        'NOT_GATE_MULTIPLE_INPUTS',
        `NOT gate "${gateData.label || gate.id}" should have exactly 1 input, found ${inputs.length}.`,
        [gate.id],
      );
    }

    // AND / OR gates should have at least 2 inputs
    if (
      (gateData.gateType === 'AND' || gateData.gateType === 'OR') &&
      inputs.length === 1
    ) {
      addWarning(
        result,
        'GATE_SINGLE_INPUT',
        `${gateData.gateType} gate "${gateData.label || gate.id}" has only 1 input; typically requires at least 2.`,
        [gate.id],
      );
    }
  }

  // --- A gate outputs one event, and an event is produced by one gate ---
  //
  // The solver identifies a gate by the signal it produces. So a gate wired
  // straight into another gate cannot be resolved, and two gates sharing an
  // output collide — one of them, and every basic event beneath it, silently
  // drops out of the cut sets. Both of those draw perfectly well on the canvas
  // and yield a confident, wrong answer, so they are errors, not warnings.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nameOf = (id: string) =>
    (nodeById.get(id)?.data as FaultTreeNodeData | undefined)?.label || id;
  const isGate = (id: string) =>
    (nodeById.get(id)?.data as FaultTreeNodeData | undefined)?.nodeKind === 'gate';

  const outputsBySource = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outputsBySource.get(edge.source) ?? [];
    list.push(edge.target);
    outputsBySource.set(edge.source, list);
  }

  const producedBy = new Map<string, string[]>();
  for (const gate of gateNodes) {
    const outputs = outputsBySource.get(gate.id) ?? [];

    if (outputs.length === 0) {
      addError(
        result,
        'GATE_NO_OUTPUT',
        `Gate "${nameOf(gate.id)}" has no output connection. Connect it to the event it causes.`,
        [gate.id],
      );
    }

    for (const target of outputs) {
      if (isGate(target)) {
        addError(
          result,
          'GATE_FEEDS_GATE',
          `Gate "${nameOf(gate.id)}" feeds gate "${nameOf(target)}" directly. A gate must output an intermediate event, and that event feeds the next gate — otherwise the analysis silently drops one of them.`,
          [gate.id, target],
        );
      } else {
        producedBy.set(target, [...(producedBy.get(target) ?? []), nameOf(gate.id)]);
      }
    }
  }

  for (const [eventId, gateNames] of producedBy) {
    if (gateNames.length > 1) {
      addError(
        result,
        'EVENT_MULTIPLE_GATES',
        `Event "${nameOf(eventId)}" is the output of ${gateNames.length} gates (${gateNames.join(', ')}). An event must be produced by at most one gate; otherwise only one of them is analysed.`,
        [eventId],
      );
    }
  }

  // --- No orphan nodes (nodes with no edges at all, except when only 1 node) ---
  if (nodes.length > 1) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    for (const node of nodes) {
      if (!connectedNodeIds.has(node.id)) {
        const nodeData = node.data as FaultTreeNodeData;
        addWarning(
          result,
          'ORPHAN_NODE',
          `Node "${nodeData.label || node.id}" has no connections.`,
          [node.id],
        );
      }
    }
  }

  // --- Check for missing labels ---
  for (const node of nodes) {
    const nodeData = node.data as FaultTreeNodeData;
    if (!nodeData.label || nodeData.label.trim() === '') {
      addError(
        result,
        'MISSING_LABEL',
        `Node "${node.id}" has no label.`,
        [node.id],
      );
    }
  }

  return result;
}

import type { Node, Edge } from '@xyflow/react';
import type { ValidationResult } from '@ramsey/engine';
import type { EventTreeNodeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Internal helpers
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
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates an event tree diagram by checking structural rules:
 * - Exactly one initiating event node
 * - Header nodes should have exactly 2 outgoing edges (success + failure)
 * - Consequence nodes should be leaf nodes (no outgoing edges)
 * - No unlabeled nodes
 */
export function validate(nodes: Node[], edges: Edge[]): ValidationResult {
  const result = emptyResult();

  // --- Empty diagram ---
  if (nodes.length === 0) {
    addError(result, 'EMPTY_DIAGRAM', 'Diagram has no nodes. Add at least one node.', []);
    return result;
  }

  // --- Exactly one initiating event ---
  const initiatingEvents = nodes.filter(
    (n) => (n.data as EventTreeNodeData).nodeKind === 'initiating_event',
  );

  if (initiatingEvents.length === 0) {
    addError(
      result,
      'NO_INITIATING_EVENT',
      'Event tree must have exactly one initiating event node.',
      [],
    );
  } else if (initiatingEvents.length > 1) {
    addError(
      result,
      'MULTIPLE_INITIATING_EVENTS',
      `Event tree must have exactly one initiating event node, but found ${initiatingEvents.length}.`,
      initiatingEvents.map((n) => n.id),
    );
  }

  // --- Header nodes must have 2 outgoing edges (success + failure) ---
  const headers = nodes.filter(
    (n) => (n.data as EventTreeNodeData).nodeKind === 'header',
  );

  for (const header of headers) {
    const outgoing = edges.filter((e) => e.source === header.id);
    if (outgoing.length !== 2) {
      addWarning(
        result,
        'HEADER_BRANCH_COUNT',
        `Header "${(header.data as EventTreeNodeData).label || header.id}" should have exactly 2 outgoing edges (success and failure), but has ${outgoing.length}.`,
        [header.id],
      );
    }
  }

  // --- Consequence nodes should have no outgoing edges ---
  const consequences = nodes.filter(
    (n) => (n.data as EventTreeNodeData).nodeKind === 'consequence',
  );

  for (const csq of consequences) {
    const outgoing = edges.filter((e) => e.source === csq.id);
    if (outgoing.length > 0) {
      addWarning(
        result,
        'CONSEQUENCE_HAS_OUTGOING',
        `Consequence "${(csq.data as EventTreeNodeData).label || csq.id}" should be a terminal node but has ${outgoing.length} outgoing edge(s).`,
        [csq.id],
      );
    }
  }

  // --- Check for unlabeled nodes ---
  for (const node of nodes) {
    const data = node.data as EventTreeNodeData;
    if (!data.label || data.label.trim() === '') {
      addError(result, 'MISSING_LABEL', `Node "${node.id}" has no label.`, [node.id]);
    }
  }

  // --- Orphan nodes (no incoming and no outgoing, excluding the initiating event) ---
  if (nodes.length > 1) {
    const nodesWithOutgoing = new Set(edges.map((e) => e.source));
    const nodesWithIncoming = new Set(edges.map((e) => e.target));
    for (const node of nodes) {
      const data = node.data as EventTreeNodeData;
      if (data.nodeKind === 'initiating_event') continue;
      if (!nodesWithOutgoing.has(node.id) && !nodesWithIncoming.has(node.id)) {
        addWarning(
          result,
          'ORPHAN_NODE',
          `Node "${data.label || node.id}" has no connections.`,
          [node.id],
        );
      }
    }
  }

  return result;
}

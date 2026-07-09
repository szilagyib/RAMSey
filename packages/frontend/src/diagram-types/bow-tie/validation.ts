import type { Node, Edge } from '@xyflow/react';
import type { ValidationResult } from '@ramsey/engine';
import type { BowTieNodeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// Bow-Tie diagram validation
// ---------------------------------------------------------------------------

export function validate(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // --- Empty diagram ---
  if (nodes.length === 0) {
    errors.push({
      code: 'EMPTY_DIAGRAM',
      message: 'Diagram has no nodes. Add at least one node to the bow-tie.',
      affectedIds: [],
    });
    return { valid: false, errors, warnings };
  }

  // --- Exactly one top event ---
  const topEvents = nodes.filter(
    (n) => (n.data as BowTieNodeData).nodeKind === 'top_event',
  );

  if (topEvents.length === 0) {
    errors.push({
      code: 'NO_TOP_EVENT',
      message:
        'A bow-tie diagram must have exactly one top event. Add a top event node.',
      affectedIds: [],
    });
  } else if (topEvents.length > 1) {
    errors.push({
      code: 'MULTIPLE_TOP_EVENTS',
      message: `A bow-tie diagram must have exactly one top event, but ${topEvents.length} were found.`,
      affectedIds: topEvents.map((n) => n.id),
    });
  }

  // --- Check for unlabeled nodes ---
  for (const node of nodes) {
    const data = node.data as BowTieNodeData;
    if (!data.label || data.label.trim() === '') {
      errors.push({
        code: 'MISSING_LABEL',
        message: `Node "${node.id}" has no label.`,
        affectedIds: [node.id],
      });
    }
  }

  // --- Threats should have at least one outgoing edge ---
  const threats = nodes.filter(
    (n) => (n.data as BowTieNodeData).nodeKind === 'threat',
  );
  for (const threat of threats) {
    const hasOutgoing = edges.some((e) => e.source === threat.id);
    if (!hasOutgoing) {
      warnings.push({
        code: 'DISCONNECTED_THREAT',
        message: `Threat "${(threat.data as BowTieNodeData).label}" has no outgoing connections.`,
        affectedIds: [threat.id],
      });
    }
  }

  // --- Consequences should have at least one incoming edge ---
  const consequences = nodes.filter(
    (n) => (n.data as BowTieNodeData).nodeKind === 'consequence',
  );
  for (const consequence of consequences) {
    const hasIncoming = edges.some((e) => e.target === consequence.id);
    if (!hasIncoming) {
      warnings.push({
        code: 'DISCONNECTED_CONSEQUENCE',
        message: `Consequence "${(consequence.data as BowTieNodeData).label}" has no incoming connections.`,
        affectedIds: [consequence.id],
      });
    }
  }

  // --- Barriers should have both incoming and outgoing edges ---
  const barriers = nodes.filter((n) => {
    const kind = (n.data as BowTieNodeData).nodeKind;
    return kind === 'preventive_barrier' || kind === 'mitigative_barrier';
  });
  for (const barrier of barriers) {
    const hasIncoming = edges.some((e) => e.target === barrier.id);
    const hasOutgoing = edges.some((e) => e.source === barrier.id);
    if (!hasIncoming || !hasOutgoing) {
      warnings.push({
        code: 'DISCONNECTED_BARRIER',
        message: `Barrier "${(barrier.data as BowTieNodeData).label}" is not fully connected.`,
        affectedIds: [barrier.id],
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

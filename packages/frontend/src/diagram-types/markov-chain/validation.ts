import type { Node, Edge } from '@xyflow/react';
import {
  createDefaultMarkovIR,
  validateMarkovChain,
  type ValidationResult,
  type State,
  type Transition,
} from '@ramsey/engine';
import type { MarkovNodeData, MarkovEdgeData } from '../../types/diagram';

/**
 * Validates the current Markov chain diagram by converting React Flow
 * nodes/edges to a ModelIR and running the engine validator.
 */
export function validateMarkovDiagram(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // --- Basic frontend checks ---
  if (nodes.length === 0) {
    errors.push({
      code: 'EMPTY_DIAGRAM',
      message: 'Diagram has no states. Add at least one state node.',
      affectedIds: [],
    });
    return { valid: false, errors, warnings };
  }

  if (nodes.length < 2) {
    warnings.push({
      code: 'SINGLE_STATE',
      message: 'A Markov chain should have at least 2 states.',
      affectedIds: [nodes[0]?.id ?? ''],
    });
  }

  if (edges.length === 0 && nodes.length >= 2) {
    warnings.push({
      code: 'NO_TRANSITIONS',
      message: 'No transitions defined between states.',
      affectedIds: [],
    });
  }

  // Check for unlabeled nodes
  for (const node of nodes) {
    const data = node.data as MarkovNodeData;
    if (!data.label || data.label.trim() === '') {
      errors.push({
        code: 'MISSING_LABEL',
        message: `State "${node.id}" has no label.`,
        affectedIds: [node.id],
      });
    }
  }

  // Check for initial state
  const hasInitial = nodes.some((n) => (n.data as MarkovNodeData).isInitial);
  if (!hasInitial) {
    warnings.push({
      code: 'NO_INITIAL_STATE',
      message: 'No initial state is marked. Select a state and mark it as initial.',
      affectedIds: [],
    });
  }

  // --- Build ModelIR and run engine validation ---
  const ir = createDefaultMarkovIR();
  ir.states = nodes.map(
    (node): State => ({
      id: node.id,
      label: (node.data as MarkovNodeData).label || node.id,
      type: (node.data as MarkovNodeData).stateType || 'operational',
      position: node.position,
    }),
  );

  ir.transitions = edges.map(
    (edge): Transition => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      rate: parseFloat((edge.data as MarkovEdgeData)?.rate) || undefined,
      probability: parseFloat((edge.data as MarkovEdgeData)?.probability) || undefined,
      label: (edge.data as MarkovEdgeData)?.label || undefined,
    }),
  );

  const initialNode = nodes.find((n) => (n.data as MarkovNodeData).isInitial);
  if (initialNode) {
    ir.initialCondition = { type: 'single', stateId: initialNode.id };
  }

  const engineResult = validateMarkovChain(ir);

  return {
    valid: errors.length === 0 && engineResult.valid,
    errors: [...errors, ...engineResult.errors],
    warnings: [...warnings, ...engineResult.warnings],
  };
}

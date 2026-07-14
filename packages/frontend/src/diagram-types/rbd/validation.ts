import type { Node, Edge } from '@xyflow/react';
import type { ValidationResult } from '@ramsey/engine';
import type { RBDNodeData } from '../../types/diagram';

// ---------------------------------------------------------------------------
// RBD diagram validation
// ---------------------------------------------------------------------------

export function validate(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // --- Empty diagram check ---
  if (nodes.length === 0) {
    errors.push({
      code: 'EMPTY_DIAGRAM',
      message: 'Diagram has no nodes. Add at least one block and both terminals.',
      affectedIds: [],
    });
    return { valid: false, errors, warnings };
  }

  // --- Terminal count checks ---
  const inputTerminals = nodes.filter((n) => (n.data as RBDNodeData).nodeKind === 'input_terminal');
  const outputTerminals = nodes.filter(
    (n) => (n.data as RBDNodeData).nodeKind === 'output_terminal',
  );
  const blocks = nodes.filter((n) => (n.data as RBDNodeData).nodeKind === 'block');

  if (inputTerminals.length === 0) {
    errors.push({
      code: 'MISSING_INPUT_TERMINAL',
      message: 'Diagram must have exactly 1 input terminal. None found.',
      affectedIds: [],
    });
  } else if (inputTerminals.length > 1) {
    errors.push({
      code: 'MULTIPLE_INPUT_TERMINALS',
      message: `Diagram must have exactly 1 input terminal. Found ${inputTerminals.length}.`,
      affectedIds: inputTerminals.map((n) => n.id),
    });
  }

  if (outputTerminals.length === 0) {
    errors.push({
      code: 'MISSING_OUTPUT_TERMINAL',
      message: 'Diagram must have exactly 1 output terminal. None found.',
      affectedIds: [],
    });
  } else if (outputTerminals.length > 1) {
    errors.push({
      code: 'MULTIPLE_OUTPUT_TERMINALS',
      message: `Diagram must have exactly 1 output terminal. Found ${outputTerminals.length}.`,
      affectedIds: outputTerminals.map((n) => n.id),
    });
  }

  // --- Missing labels ---
  for (const node of nodes) {
    const data = node.data as RBDNodeData;
    if (!data.label || data.label.trim() === '') {
      errors.push({
        code: 'MISSING_LABEL',
        message: `Node "${node.id}" has no label.`,
        affectedIds: [node.id],
      });
    }
  }

  // --- No blocks warning ---
  if (blocks.length === 0) {
    warnings.push({
      code: 'NO_BLOCKS',
      message: 'Diagram has no block nodes. Add at least one block between the terminals.',
      affectedIds: [],
    });
  }

  // --- Reachability check ---
  // All blocks should be reachable from the input terminal via edges
  if (inputTerminals.length === 1 && blocks.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push(edge.target);
    }

    const visited = new Set<string>();
    const queue: string[] = [inputTerminals[0].id];
    visited.add(inputTerminals[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const unreachableBlocks = blocks.filter((b) => !visited.has(b.id));
    if (unreachableBlocks.length > 0) {
      warnings.push({
        code: 'UNREACHABLE_BLOCKS',
        message: `${unreachableBlocks.length} block(s) are not reachable from the input terminal.`,
        affectedIds: unreachableBlocks.map((b) => b.id),
      });
    }
  }

  // --- No edges warning ---
  if (edges.length === 0 && nodes.length >= 2) {
    warnings.push({
      code: 'NO_CONNECTIONS',
      message: 'No connections defined between nodes.',
      affectedIds: [],
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

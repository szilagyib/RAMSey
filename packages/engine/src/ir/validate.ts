import type { ModelIR, Transition } from './schema.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ValidationError {
  code: string;
  message: string;
  affectedIds: string[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  affectedIds: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

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

function mergeResults(a: ValidationResult, b: ValidationResult): ValidationResult {
  return {
    valid: a.valid && b.valid,
    errors: [...a.errors, ...b.errors],
    warnings: [...a.warnings, ...b.warnings],
  };
}

// ---------------------------------------------------------------------------
// Generic model-level validation (applies to every diagram type)
// ---------------------------------------------------------------------------

function validateGeneric(ir: ModelIR): ValidationResult {
  const result = emptyResult();

  // Version must be present
  if (!ir.version || ir.version.trim().length === 0) {
    addError(result, 'MISSING_VERSION', 'ModelIR version is required.', []);
  }

  // Type must be present
  const validTypes = [
    'markov_chain',
    'fault_tree',
    'event_tree',
    'reliability_block_diagram',
    'bow_tie',
    'fmea',
  ];
  if (!validTypes.includes(ir.type)) {
    addError(result, 'INVALID_TYPE', `Unknown diagram type: "${ir.type}".`, []);
  }

  // unitConfig completeness
  if (!ir.unitConfig) {
    addError(result, 'MISSING_UNIT_CONFIG', 'UnitConfig is required.', []);
  }

  // Duplicate component IDs
  const componentIds = ir.components.map((c) => c.id);
  const duplicateComponentIds = componentIds.filter(
    (id, idx) => componentIds.indexOf(id) !== idx,
  );
  if (duplicateComponentIds.length > 0) {
    addError(
      result,
      'DUPLICATE_COMPONENT_ID',
      `Duplicate component IDs found: ${[...new Set(duplicateComponentIds)].join(', ')}.`,
      [...new Set(duplicateComponentIds)],
    );
  }

  // Duplicate state IDs
  const stateIds = ir.states.map((s) => s.id);
  const duplicateStateIds = stateIds.filter((id, idx) => stateIds.indexOf(id) !== idx);
  if (duplicateStateIds.length > 0) {
    addError(
      result,
      'DUPLICATE_STATE_ID',
      `Duplicate state IDs found: ${[...new Set(duplicateStateIds)].join(', ')}.`,
      [...new Set(duplicateStateIds)],
    );
  }

  // Parameter names should be unique
  const paramNames = ir.parameters.map((p) => p.name);
  const duplicateParams = paramNames.filter((n, idx) => paramNames.indexOf(n) !== idx);
  if (duplicateParams.length > 0) {
    addWarning(
      result,
      'DUPLICATE_PARAMETER_NAME',
      `Duplicate parameter names: ${[...new Set(duplicateParams)].join(', ')}.`,
      [],
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// Markov chain-specific validation
// ---------------------------------------------------------------------------

export function validateMarkovChain(ir: ModelIR): ValidationResult {
  const result = emptyResult();

  // Must have at least one state
  if (ir.states.length === 0) {
    addError(
      result,
      'NO_STATES',
      'A Markov chain must contain at least one state.',
      [],
    );
    // Early return — further checks are meaningless without states
    return result;
  }

  // Must have an initial condition
  if (!ir.initialCondition) {
    addError(
      result,
      'MISSING_INITIAL_CONDITION',
      'Markov chain requires an initial condition.',
      [],
    );
  } else if (ir.initialCondition.type === 'single') {
    const stateIds = new Set(ir.states.map((s) => s.id));
    if (!stateIds.has(ir.initialCondition.stateId)) {
      addError(
        result,
        'INVALID_INITIAL_STATE',
        `Initial state "${ir.initialCondition.stateId}" does not exist in the state list.`,
        [ir.initialCondition.stateId],
      );
    }
  } else if (ir.initialCondition.type === 'distribution') {
    const stateIds = new Set(ir.states.map((s) => s.id));
    const invalidRefs = Object.keys(ir.initialCondition.probabilities).filter(
      (sid) => !stateIds.has(sid),
    );
    if (invalidRefs.length > 0) {
      addError(
        result,
        'INVALID_INITIAL_DISTRIBUTION_STATE',
        `Initial condition distribution references unknown states: ${invalidRefs.join(', ')}.`,
        invalidRefs,
      );
    }
    const total = Object.values(ir.initialCondition.probabilities).reduce(
      (sum, p) => sum + p,
      0,
    );
    if (Math.abs(total - 1.0) > 1e-9) {
      addWarning(
        result,
        'INITIAL_DISTRIBUTION_SUM',
        `Initial condition probabilities sum to ${total}, expected 1.0.`,
        [],
      );
    }
  }

  // Transitions must reference valid states
  const stateIdSet = new Set(ir.states.map((s) => s.id));
  const invalidTransitions: Transition[] = [];
  for (const t of ir.transitions) {
    const badIds: string[] = [];
    if (!stateIdSet.has(t.from)) {
      badIds.push(t.from);
    }
    if (!stateIdSet.has(t.to)) {
      badIds.push(t.to);
    }
    if (badIds.length > 0) {
      invalidTransitions.push(t);
      addError(
        result,
        'INVALID_TRANSITION_STATE',
        `Transition "${t.id}" references unknown state(s): ${badIds.join(', ')}.`,
        [t.id, ...badIds],
      );
    }
  }

  // Transitions should carry a rate or probability
  for (const t of ir.transitions) {
    if (t.rate === undefined && t.probability === undefined) {
      addError(
        result,
        'TRANSITION_MISSING_RATE',
        `Transition "${t.id}" has neither a rate nor a probability.`,
        [t.id],
      );
    }
  }

  // Detect orphan states (states with no incoming and no outgoing transitions,
  // excluding the case where there is only one state)
  if (ir.states.length > 1) {
    const statesWithOutgoing = new Set(ir.transitions.map((t) => t.from));
    const statesWithIncoming = new Set(ir.transitions.map((t) => t.to));
    for (const s of ir.states) {
      if (!statesWithOutgoing.has(s.id) && !statesWithIncoming.has(s.id)) {
        addWarning(
          result,
          'ORPHAN_STATE',
          `State "${s.id}" has no incoming or outgoing transitions.`,
          [s.id],
        );
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public entry point — dispatches to type-specific validators
// ---------------------------------------------------------------------------

export function validateModelIR(ir: ModelIR): ValidationResult {
  let result = validateGeneric(ir);

  switch (ir.type) {
    case 'markov_chain':
      result = mergeResults(result, validateMarkovChain(ir));
      break;

    // Future diagram-specific validators will be added here.
    case 'fault_tree':
    case 'event_tree':
    case 'reliability_block_diagram':
    case 'bow_tie':
    case 'fmea':
      // No additional validation implemented yet for these types.
      break;
  }

  return result;
}

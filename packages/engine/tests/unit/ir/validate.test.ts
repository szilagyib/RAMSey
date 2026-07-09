import { describe, it, expect } from 'vitest';
import {
  createDefaultModelIR,
  createDefaultMarkovIR,
  type ModelIR,
} from '../../../src/ir/schema.js';
import {
  validateModelIR,
  validateMarkovChain,
} from '../../../src/ir/validate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal but valid two-state Markov chain IR. */
function makeValidMarkov(): ModelIR {
  const ir = createDefaultMarkovIR();
  ir.states.push({
    id: 'S1',
    label: 'Failed',
    type: 'failed',
  });
  ir.transitions.push(
    {
      id: 'T0',
      from: 'S0',
      to: 'S1',
      rate: 1e-4,
      label: 'failure',
    },
    {
      id: 'T1',
      from: 'S1',
      to: 'S0',
      rate: 0.5,
      label: 'repair',
    },
  );
  return ir;
}

// ---------------------------------------------------------------------------
// validateModelIR — high-level
// ---------------------------------------------------------------------------

describe('validateModelIR', () => {
  it('rejects a Markov chain with no states', () => {
    const ir = createDefaultModelIR('markov_chain');
    // ir has zero states and no initial condition
    const result = validateModelIR(ir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NO_STATES')).toBe(true);
  });

  it('passes for a valid two-state Markov chain', () => {
    const ir = makeValidMarkov();
    const result = validateModelIR(ir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns warnings for orphan states', () => {
    const ir = makeValidMarkov();
    // Add an isolated state
    ir.states.push({ id: 'S_orphan', label: 'Orphan', type: 'degraded' });
    const result = validateModelIR(ir);

    // Should still be valid (orphan is a warning, not an error)
    expect(result.warnings.some((w) => w.code === 'ORPHAN_STATE')).toBe(true);
    expect(
      result.warnings.find((w) => w.code === 'ORPHAN_STATE')!.affectedIds,
    ).toContain('S_orphan');
  });
});

// ---------------------------------------------------------------------------
// validateMarkovChain — detailed
// ---------------------------------------------------------------------------

describe('validateMarkovChain', () => {
  it('detects orphan states', () => {
    const ir = makeValidMarkov();
    ir.states.push({ id: 'S2', label: 'Isolated', type: 'degraded' });

    const result = validateMarkovChain(ir);
    const orphanWarning = result.warnings.find((w) => w.code === 'ORPHAN_STATE');
    expect(orphanWarning).toBeDefined();
    expect(orphanWarning!.affectedIds).toContain('S2');
  });

  it('detects missing initial condition', () => {
    const ir = makeValidMarkov();
    ir.initialCondition = null;

    const result = validateMarkovChain(ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'MISSING_INITIAL_CONDITION'),
    ).toBe(true);
  });

  it('detects transitions referencing invalid states', () => {
    const ir = makeValidMarkov();
    ir.transitions.push({
      id: 'T_bad',
      from: 'S0',
      to: 'NONEXISTENT',
      rate: 0.001,
    });

    const result = validateMarkovChain(ir);
    expect(result.valid).toBe(false);
    const err = result.errors.find(
      (e) => e.code === 'INVALID_TRANSITION_STATE',
    );
    expect(err).toBeDefined();
    expect(err!.affectedIds).toContain('T_bad');
    expect(err!.affectedIds).toContain('NONEXISTENT');
  });

  it('detects transitions without rate or probability', () => {
    const ir = makeValidMarkov();
    ir.transitions.push({
      id: 'T_no_rate',
      from: 'S0',
      to: 'S1',
      // no rate, no probability
    });

    const result = validateMarkovChain(ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'TRANSITION_MISSING_RATE'),
    ).toBe(true);
  });

  it('validates initial condition referencing a nonexistent state', () => {
    const ir = makeValidMarkov();
    ir.initialCondition = { type: 'single', stateId: 'DOES_NOT_EXIST' };

    const result = validateMarkovChain(ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'INVALID_INITIAL_STATE'),
    ).toBe(true);
  });

  it('warns when initial distribution probabilities do not sum to 1', () => {
    const ir = makeValidMarkov();
    ir.initialCondition = {
      type: 'distribution',
      probabilities: { S0: 0.5, S1: 0.3 },
    };

    const result = validateMarkovChain(ir);
    expect(
      result.warnings.some((w) => w.code === 'INITIAL_DISTRIBUTION_SUM'),
    ).toBe(true);
  });

  it('passes a properly formed Markov chain without errors', () => {
    const ir = makeValidMarkov();
    const result = validateMarkovChain(ir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

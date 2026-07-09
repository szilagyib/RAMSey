import { describe, it, expect } from 'vitest';
import {
  createDefaultModelIR,
  createDefaultMarkovIR,
  type DiagramType,
  type ModelIR,
  type ValueRef,
} from '../../../src/ir/schema.js';

// ---------------------------------------------------------------------------
// createDefaultModelIR
// ---------------------------------------------------------------------------

describe('createDefaultModelIR', () => {
  const diagramTypes: DiagramType[] = [
    'markov_chain',
    'fault_tree',
    'event_tree',
    'reliability_block_diagram',
    'bow_tie',
    'fmea',
  ];

  it.each(diagramTypes)(
    'creates a valid ModelIR for diagram type "%s"',
    (type) => {
      const ir: ModelIR = createDefaultModelIR(type);

      expect(ir.version).toBe('1.0.0');
      expect(ir.type).toBe(type);
      expect(ir.unitConfig).toEqual({ timeBase: 'hours', rateBase: '1/h' });
      expect(ir.components).toEqual([]);
      expect(ir.events).toEqual([]);
      expect(ir.gates).toEqual([]);
      expect(ir.states).toEqual([]);
      expect(ir.transitions).toEqual([]);
      expect(ir.blocks).toEqual([]);
      expect(ir.barriers).toEqual([]);
      expect(ir.dependencies).toEqual([]);
      expect(ir.parameters).toEqual([]);
      expect(ir.distributions).toEqual([]);
      expect(ir.initialCondition).toBeNull();
      expect(ir.missionTime).toBe(8760);
      expect(ir.repairPolicy).toBeNull();
    },
  );

  it('returns independent instances (no shared references)', () => {
    const a = createDefaultModelIR('markov_chain');
    const b = createDefaultModelIR('markov_chain');
    a.states.push({ id: 'S0', label: 'Test', type: 'operational' });
    expect(b.states).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createDefaultMarkovIR
// ---------------------------------------------------------------------------

describe('createDefaultMarkovIR', () => {
  it('creates a Markov-specific IR with the correct diagram type', () => {
    const ir = createDefaultMarkovIR();
    expect(ir.type).toBe('markov_chain');
  });

  it('provides a default operational state S0', () => {
    const ir = createDefaultMarkovIR();
    expect(ir.states).toHaveLength(1);
    expect(ir.states[0]).toEqual({
      id: 'S0',
      label: 'Operational',
      type: 'operational',
      position: { x: 0, y: 0 },
    });
  });

  it('sets the initial condition to the single state S0', () => {
    const ir = createDefaultMarkovIR();
    expect(ir.initialCondition).toEqual({ type: 'single', stateId: 'S0' });
  });

  it('provides an unlimited repair policy', () => {
    const ir = createDefaultMarkovIR();
    expect(ir.repairPolicy).toEqual({ type: 'unlimited' });
  });

  it('keeps the default mission time', () => {
    const ir = createDefaultMarkovIR();
    expect(ir.missionTime).toBe(8760);
  });
});

// ---------------------------------------------------------------------------
// ValueRef type structure
// ---------------------------------------------------------------------------

describe('ValueRef types', () => {
  it('accepts a plain number', () => {
    const v: ValueRef = 42;
    expect(v).toBe(42);
  });

  it('accepts a parameter reference', () => {
    const v: ValueRef = { param: 'lambda' };
    expect(v).toEqual({ param: 'lambda' });
  });

  it('accepts an expression string', () => {
    const v: ValueRef = { expr: 'lambda * 2' };
    expect(v).toEqual({ expr: 'lambda * 2' });
  });

  it('can be used inside a Component failureRate', () => {
    const ir = createDefaultModelIR('markov_chain');
    ir.components.push({
      id: 'C1',
      name: 'Pump',
      failureRate: { param: 'pump_lambda' },
      metadata: {},
    });
    const rate = ir.components[0].failureRate as { param: string };
    expect(rate.param).toBe('pump_lambda');
  });
});

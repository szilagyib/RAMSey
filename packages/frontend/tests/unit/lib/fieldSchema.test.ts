import { describe, it, expect } from 'vitest';
import {
  ENUM_OPTIONS,
  READONLY_FIELDS,
  HIDDEN_FIELDS,
  fieldLabel,
  humanizeKey,
  optionLabel,
} from '../../../src/lib/fieldSchema';

describe('field labels', () => {
  it('reads as English, not as variable names', () => {
    expect(fieldLabel('stateType')).toBe('State type');
    expect(fieldLabel('failureRate')).toBe('Failure rate (λ)');
    expect(fieldLabel('isInitial')).toBe('Initial state');
    expect(fieldLabel('nodeKind')).toBe('Kind');
  });

  it('humanizes an unknown key rather than showing it raw', () => {
    expect(humanizeKey('someNewField')).toBe('Some new field');
    expect(humanizeKey('node_kind')).toBe('Node kind');
    expect(fieldLabel('someNewField')).toBe('Some new field');
  });
});

describe('option labels', () => {
  it('spells out enum values', () => {
    expect(optionLabel('operational')).toBe('Operational');
    expect(optionLabel('input_terminal')).toBe('Input terminal');
    expect(optionLabel('preventive_barrier')).toBe('Preventive barrier');
  });

  it('leaves gate acronyms alone but spells out K_OF_N', () => {
    expect(optionLabel('AND')).toBe('AND');
    expect(optionLabel('XOR')).toBe('XOR');
    expect(optionLabel('K_OF_N')).toBe('K of N');
  });
});

describe('which fields are editable', () => {
  it('offers the enums the node redraws itself from', () => {
    expect(ENUM_OPTIONS.stateType).toEqual(['operational', 'degraded', 'failed', 'absorbing']);
    expect(ENUM_OPTIONS.eventType).toEqual(['basic', 'intermediate', 'top', 'undeveloped']);
    expect(ENUM_OPTIONS.gateType).toEqual(['AND', 'OR', 'NOT', 'K_OF_N', 'XOR']);
    expect(ENUM_OPTIONS.branchType).toEqual(['success', 'failure']);
  });

  it('locks nodeKind — it picks which component draws the node', () => {
    expect(READONLY_FIELDS.has('nodeKind')).toBe(true);
    // ...and is therefore never offered as an enum to change.
    expect(ENUM_OPTIONS.nodeKind).toBeUndefined();
  });

  it('hides the colour channels and control points, which have their own controls', () => {
    for (const key of ['color', 'fillColor', 'textColor', 'cpX', 'cpY']) {
      expect(HIDDEN_FIELDS.has(key)).toBe(true);
    }
  });
});

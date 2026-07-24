import { describe, it, expect } from 'vitest';
import { validateNumericField } from '../../../src/lib/fieldDomains';

describe('validateNumericField', () => {
  it('accepts a blank value — these fields are optional until analysis', () => {
    expect(validateNumericField('probability', '')).toBeNull();
    expect(validateNumericField('rate', '   ')).toBeNull();
  });

  it('ignores fields with no declared domain', () => {
    expect(validateNumericField('label', 'anything')).toBeNull();
  });

  it('accepts probabilities in [0, 1] and rejects outside', () => {
    for (const ok of ['0', '0.5', '1']) {
      expect(validateNumericField('probability', ok)).toBeNull();
    }
    expect(validateNumericField('probability', '1.5')).toMatch(/between 0 and 1/);
    expect(validateNumericField('probability', '-0.1')).toMatch(/between 0 and 1/);
  });

  it('applies the same bound to barrier effectiveness', () => {
    expect(validateNumericField('effectiveness', '0.9')).toBeNull();
    expect(validateNumericField('effectiveness', '2')).toMatch(/between 0 and 1/);
  });

  // A rate is per unit time, so values above 1 are perfectly valid.
  it('accepts rates of any non-negative size but rejects negatives', () => {
    expect(validateNumericField('rate', '0')).toBeNull();
    expect(validateNumericField('rate', '250')).toBeNull();
    expect(validateNumericField('failureRate', '1e-6')).toBeNull();
    expect(validateNumericField('repairRate', '-1')).toMatch(/0 or more/);
  });

  it('rejects text that is not a number', () => {
    expect(validateNumericField('probability', 'abc')).toMatch(/between 0 and 1/);
    expect(validateNumericField('rate', 'fast')).toMatch(/0 or more/);
  });
});

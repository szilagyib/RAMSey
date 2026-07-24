import { describe, it, expect } from 'vitest';
import {
  convertTime,
  convertRate,
  getConversionFactor,
  getRateUnit,
  HOURS_PER_DAY,
  HOURS_PER_YEAR,
} from '../../../src/ir/units.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('HOURS_PER_DAY equals 24', () => {
    expect(HOURS_PER_DAY).toBe(24);
  });

  it('HOURS_PER_YEAR equals 8760', () => {
    expect(HOURS_PER_YEAR).toBe(8760);
  });
});

// ---------------------------------------------------------------------------
// getConversionFactor
// ---------------------------------------------------------------------------

describe('getConversionFactor', () => {
  it('returns 1 for identity conversions', () => {
    expect(getConversionFactor('hours', 'hours')).toBe(1);
    expect(getConversionFactor('days', 'days')).toBe(1);
    expect(getConversionFactor('years', 'years')).toBe(1);
  });

  it('hours to days divides by 24', () => {
    expect(getConversionFactor('hours', 'days')).toBeCloseTo(1 / 24);
  });

  it('days to hours multiplies by 24', () => {
    expect(getConversionFactor('days', 'hours')).toBe(24);
  });

  it('hours to years divides by 8760', () => {
    expect(getConversionFactor('hours', 'years')).toBeCloseTo(1 / 8760);
  });

  it('years to hours multiplies by 8760', () => {
    expect(getConversionFactor('years', 'hours')).toBe(8760);
  });
});

// ---------------------------------------------------------------------------
// convertTime
// ---------------------------------------------------------------------------

describe('convertTime', () => {
  it('converts hours to days', () => {
    expect(convertTime(48, 'hours', 'days')).toBeCloseTo(2);
  });

  it('converts days to hours', () => {
    expect(convertTime(2, 'days', 'hours')).toBe(48);
  });

  it('converts hours to years', () => {
    expect(convertTime(8760, 'hours', 'years')).toBeCloseTo(1);
  });

  it('converts years to hours', () => {
    expect(convertTime(1, 'years', 'hours')).toBe(8760);
  });

  it('converts days to years', () => {
    expect(convertTime(365, 'days', 'years')).toBeCloseTo(365 * 24 / 8760);
  });

  it('handles zero values', () => {
    expect(convertTime(0, 'hours', 'days')).toBe(0);
    expect(convertTime(0, 'years', 'hours')).toBe(0);
  });

  it('identity conversion returns the same value', () => {
    expect(convertTime(123.456, 'hours', 'hours')).toBe(123.456);
    expect(convertTime(7.89, 'days', 'days')).toBe(7.89);
  });
});

// ---------------------------------------------------------------------------
// convertRate
// ---------------------------------------------------------------------------

describe('convertRate', () => {
  it('converts 1/h to 1/d (multiply by 24)', () => {
    expect(convertRate(1, '1/h', '1/d')).toBeCloseTo(24);
  });

  it('converts 1/d to 1/h (divide by 24)', () => {
    expect(convertRate(24, '1/d', '1/h')).toBeCloseTo(1);
  });

  it('converts 1/h to 1/y (multiply by 8760)', () => {
    expect(convertRate(1, '1/h', '1/y')).toBeCloseTo(8760);
  });

  it('converts 1/y to 1/h (divide by 8760)', () => {
    expect(convertRate(8760, '1/y', '1/h')).toBeCloseTo(1);
  });

  it('identity conversion returns the same value', () => {
    expect(convertRate(0.001, '1/h', '1/h')).toBe(0.001);
  });

  it('handles zero values', () => {
    expect(convertRate(0, '1/h', '1/d')).toBe(0);
  });

  it('round-trips correctly (1/h -> 1/d -> 1/h)', () => {
    const original = 0.0042;
    const inDays = convertRate(original, '1/h', '1/d');
    const backToHours = convertRate(inDays, '1/d', '1/h');
    expect(backToHours).toBeCloseTo(original, 10);
  });
});

// ---------------------------------------------------------------------------
// getRateUnit
// ---------------------------------------------------------------------------

describe('getRateUnit', () => {
  it('returns "1/h" for hours', () => {
    expect(getRateUnit('hours')).toBe('1/h');
  });

  it('returns "1/d" for days', () => {
    expect(getRateUnit('days')).toBe('1/d');
  });

  it('returns "1/y" for years', () => {
    expect(getRateUnit('years')).toBe('1/y');
  });
});

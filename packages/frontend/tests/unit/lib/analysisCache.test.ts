import { describe, it, expect, beforeEach } from 'vitest';
import type { AnalyzeResponse } from '@ramsey/engine';
import { getCachedResult, setCachedResult, getLatestResult } from '../../../src/lib/analysisCache';

function resp(value: number): AnalyzeResponse {
  return {
    status: 'success',
    solver: { name: 's', version: '1' },
    modelIRVersion: '1.0.0',
    contentHash: 'h',
    metrics: { availability: value },
    contributions: {},
    numericMetadata: { method: 'x', tolerance: 0, iterations: 0, residualNorm: 0, truncation: 0, stiffnessDetected: false, methodAutoSelected: false },
    trace: { assumptions: [], normalizations: [], unitConversions: [], simplifications: [], methodDetails: '' },
    warnings: [],
    errorBounds: {},
    computeTimeMs: 1,
    timestamp: '2026-01-01T00:00:00Z',
  };
}

describe('analysisCache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a result by (diagram, method, hash)', () => {
    expect(getCachedResult('d1', 'availability', 'hashA')).toBeNull();
    setCachedResult('d1', 'availability', 'hashA', resp(0.9));
    expect(getCachedResult('d1', 'availability', 'hashA')?.metrics.availability).toBe(0.9);
  });

  it('isolates entries by method and by hash', () => {
    setCachedResult('d1', 'availability', 'hashA', resp(0.9));
    expect(getCachedResult('d1', 'reliability', 'hashA')).toBeNull(); // different method
    expect(getCachedResult('d1', 'availability', 'hashB')).toBeNull(); // different model state
  });

  it('returns the most recent result for a diagram', () => {
    setCachedResult('d1', 'availability', 'hashA', resp(0.9), 1000);
    setCachedResult('d1', 'reliability', 'hashB', resp(0.5), 2000);
    const latest = getLatestResult('d1');
    expect(latest?.method).toBe('reliability');
    expect(latest?.response.metrics.availability).toBe(0.5);
    expect(getLatestResult('other')).toBeNull();
  });
});

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

  // Entries are keyed by the model's content hash, which says nothing about the
  // solver that produced the numbers. So a solver correctness fix cannot reach
  // anyone holding a cached result: the model is unchanged, the entry still
  // matches, and the panel keeps serving the old numbers under a "model
  // unchanged" label. The store key carries a version for exactly this — bump
  // it when solver numerics change, and stale results are left behind.
  describe('results cached by a superseded solver', () => {
    const legacyEntry = () =>
      JSON.stringify([
        {
          key: 'd1:transient:hashA',
          diagramId: 'd1',
          method: 'transient',
          response: resp(0),
          at: 1000,
        },
      ]);

    it('are not served', () => {
      localStorage.setItem('ramsey.analysisCache.v1', legacyEntry());
      expect(getCachedResult('d1', 'transient', 'hashA')).toBeNull();
      expect(getLatestResult('d1')).toBeNull();
    });

    it('are cleared out rather than left in storage forever', () => {
      localStorage.setItem('ramsey.analysisCache.v1', legacyEntry());
      getCachedResult('d1', 'transient', 'hashA');
      expect(localStorage.getItem('ramsey.analysisCache.v1')).toBeNull();
    });
  });
});

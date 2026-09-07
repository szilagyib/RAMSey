import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnalyzeResponse } from '@ramsey/engine';
import {
  getCachedResult,
  setCachedResult,
  getLatestResult,
  clearSupersededStores,
} from '../../../src/lib/analysisCache';

function resp(value: number): AnalyzeResponse {
  return {
    status: 'success',
    solver: { name: 's', version: '1' },
    modelIRVersion: '1.0.0',
    contentHash: 'h',
    metrics: { availability: value },
    contributions: {},
    numericMetadata: {
      method: 'x',
      tolerance: 0,
      iterations: 0,
      residualNorm: 0,
      truncation: 0,
      stiffnessDetected: false,
      methodAutoSelected: false,
    },
    trace: {
      assumptions: [],
      normalizations: [],
      unitConversions: [],
      simplifications: [],
      methodDetails: '',
    },
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
      clearSupersededStores();
      expect(localStorage.getItem('ramsey.analysisCache.v1')).toBeNull();
    });

    // Naming a single predecessor only works for the store that came just
    // before. A browser that skipped a version keeps its entries forever, which
    // is the leak the cleanup exists to prevent.
    it('are cleared however many versions back they are', () => {
      localStorage.setItem('ramsey.analysisCache.v1', legacyEntry());
      localStorage.setItem('ramsey.analysisCache', legacyEntry());
      localStorage.setItem('ramsey.analysisCache.v0', legacyEntry());

      clearSupersededStores();

      expect(localStorage.getItem('ramsey.analysisCache.v1')).toBeNull();
      expect(localStorage.getItem('ramsey.analysisCache')).toBeNull();
      expect(localStorage.getItem('ramsey.analysisCache.v0')).toBeNull();
    });

    it('leaves unrelated keys alone', () => {
      localStorage.setItem('ramsey-inspector-width', '320');
      clearSupersededStores();
      expect(localStorage.getItem('ramsey-inspector-width')).toBe('320');
    });

    // The cleanup used to sit inside load()'s blanket catch, so anything it
    // threw — Safari private mode, a disabled-storage setting, a quota error —
    // was read as "the cache is unreadable". getCachedResult then missed, and
    // setCachedResult rebuilt the list from empty and persisted it, discarding
    // up to 50 good entries to fail at deleting one dead key.
    it('keeps the current cache readable when the cleanup itself fails', () => {
      setCachedResult('d1', 'availability', 'hashA', resp(0.9));
      localStorage.setItem('ramsey.analysisCache.v1', legacyEntry());

      const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage unavailable');
      });
      expect(() => clearSupersededStores()).not.toThrow();
      removeItem.mockRestore();

      expect(getCachedResult('d1', 'availability', 'hashA')?.metrics.availability).toBe(0.9);
    });

    // Reading the cache should not write to it. The cleanup ran unconditionally
    // on every load, so every panel mount and every analysis issued a
    // removeItem for a key that had been gone for months.
    it('does not write to storage once there is nothing to clean', () => {
      setCachedResult('d1', 'availability', 'hashA', resp(0.9));
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

      getCachedResult('d1', 'availability', 'hashA');
      getLatestResult('d1');

      expect(removeItem).not.toHaveBeenCalled();
      removeItem.mockRestore();
    });
  });
});

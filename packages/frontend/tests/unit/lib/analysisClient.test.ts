import { describe, it, expect } from 'vitest';
import type { ModelIR } from '@ramsey/engine';
import { runAnalysis } from '../../../src/lib/analysisClient';

// In the test environment there is no real Worker runtime, so runAnalysis
// exercises the inline fallback path — verifying the client returns correct
// engine results regardless of where execution happens.
describe('runAnalysis (inline fallback)', () => {
  // The full suite runs many jsdom files concurrently; keep this real solver integration
  // test strict, but give it enough headroom for CPU contention on CI and dev machines.
  it('returns the engine result for a Markov availability request', async () => {
    const ir: ModelIR = {
      version: '1.0.0',
      type: 'markov_chain',
      unitConfig: { timeBase: 'hours', rateBase: '1/h' },
      components: [],
      events: [],
      gates: [],
      states: [
        { id: 'S0', label: 'Up', type: 'operational' },
        { id: 'S1', label: 'Down', type: 'failed' },
      ],
      transitions: [
        { id: 't0', from: 'S0', to: 'S1', rate: 0.001 },
        { id: 't1', from: 'S1', to: 'S0', rate: 0.01 },
      ],
      blocks: [],
      barriers: [],
      dependencies: [],
      parameters: [],
      distributions: [],
      initialCondition: { type: 'single', stateId: 'S0' },
      missionTime: 1000,
      repairPolicy: null,
    };

    const res = await runAnalysis({
      modelIR: ir,
      method: 'availability',
      options: {},
      executionTarget: 'browser',
    });
    expect(res.status).toBe('success');
    const availability = res.metrics.availability;
    expect(availability).toBeTypeOf('number');
    expect(Math.abs((availability as number) - 0.01 / 0.011)).toBeLessThan(1e-6);
  }, 10_000);
});

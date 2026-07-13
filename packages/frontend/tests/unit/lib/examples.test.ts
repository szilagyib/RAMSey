import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, validateModelIR } from '@ramsey/engine';
import { markovToModelIR } from '../../../src/lib/toModelIR';
import { validateMarkovDiagram } from '../../../src/diagram-types/markov-chain/validation';

/**
 * The shipped examples are the first thing a new user opens. They must import,
 * validate clean, and actually solve — a broken example is worse than none.
 */
function loadExample(file: string) {
  const raw = readFileSync(resolve(__dirname, '../../../../../examples', file), 'utf8');
  const doc = JSON.parse(raw);
  return { doc, nodes: doc.nodes, edges: doc.edges };
}

describe('examples/markov-2oo3-pump-station.json', () => {
  const { doc, nodes, edges } = loadExample('markov-2oo3-pump-station.json');

  it('is a 2oo3 station with exactly one initial state', () => {
    expect(doc.type).toBe('markov_chain');
    expect(nodes).toHaveLength(7);
    expect(edges).toHaveLength(13);
    expect(nodes.filter((n: { data: { isInitial: boolean } }) => n.data.isInitial)).toHaveLength(1);
  });

  it('validates with no errors', () => {
    const result = validateMarkovDiagram(nodes, edges);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('is irreducible — no absorbing state, so steady-state metrics converge', () => {
    const types = nodes.map((n: { data: { stateType: string } }) => n.data.stateType);
    expect(types).not.toContain('absorbing');
    expect(validateModelIR(markovToModelIR(nodes, edges, 8760)).valid).toBe(true);
  });

  it('solves to a realistic availability (three pumps, 2oo3, single repair crew)', async () => {
    const ir = markovToModelIR(nodes, edges, 8760);
    const res = await analyze({ modelIR: ir, method: 'availability', options: {} });

    expect(res.status).toBe('success');
    const a = res.metrics.availability as number;
    // High but not perfect: proof-test bypass and common-cause dominate downtime.
    expect(a).toBeGreaterThan(0.99);
    expect(a).toBeLessThan(1);
    // No "absorbing states present" warning — that is the point of this example.
    expect(res.warnings.map((w) => w.code)).not.toContain('absorbing_present');
  });

  it('steady-state probabilities sum to 1 across all seven states', async () => {
    const ir = markovToModelIR(nodes, edges, 8760);
    const res = await analyze({ modelIR: ir, method: 'steady_state', options: {} });
    expect(res.status).toBe('success');

    const probs = Object.values(res.contributions.steady_state ?? {});
    expect(probs).toHaveLength(7);
    expect(probs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 6);
  });
});

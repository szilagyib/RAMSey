import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, validateModelIR } from '@ramsey/engine';
import {
  markovToModelIR,
  faultTreeToModelIR,
  rbdToModelIR,
  eventTreeToModelIR,
  bowTieToModelIR,
} from '../../../src/lib/toModelIR';
import { validateMarkovDiagram } from '../../../src/diagram-types/markov-chain/validation';
import { validate as validateFaultTree } from '../../../src/diagram-types/fault-tree/validation';

/**
 * The shipped examples are the first thing a new user opens. They must import,
 * validate clean, and actually solve — a broken example is worse than none, and
 * a plausible-but-wrong one is worse still.
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
    expect(validateMarkovDiagram(nodes, edges).errors).toEqual([]);
  });

  it('is irreducible — no absorbing state, so steady-state metrics converge', () => {
    const types = nodes.map((n: { data: { stateType: string } }) => n.data.stateType);
    expect(types).not.toContain('absorbing');
    expect(validateModelIR(markovToModelIR(nodes, edges, 8760)).valid).toBe(true);
  });

  it('solves to a realistic availability (three pumps, 2oo3, single repair crew)', async () => {
    const res = await analyze({
      modelIR: markovToModelIR(nodes, edges, 8760),
      method: 'availability',
      options: {},
    });
    expect(res.status).toBe('success');
    expect(res.metrics.availability as number).toBeGreaterThan(0.99);
    expect(res.metrics.availability as number).toBeLessThan(1);
    expect(res.warnings.map((w) => w.code)).not.toContain('absorbing_present');
  });

  it('steady-state probabilities sum to 1 across all seven states', async () => {
    const res = await analyze({
      modelIR: markovToModelIR(nodes, edges, 8760),
      method: 'steady_state',
      options: {},
    });
    const probs = Object.values(res.contributions.steady_state ?? {});
    expect(probs).toHaveLength(7);
    expect(probs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 6);
  });
});

describe('examples/fault-tree-cooling-loss.json', () => {
  const { nodes, edges } = loadExample('fault-tree-cooling-loss.json');

  it('validates clean — in particular no gate feeds a gate', () => {
    const errors = validateFaultTree(nodes, edges).errors.map((e) => e.code);
    expect(errors).toEqual([]);
  });

  it('produces the cut sets the redundancy implies, not a pile of single points', async () => {
    const res = await analyze({
      modelIR: faultTreeToModelIR(nodes, edges),
      method: 'minimal_cut_sets',
      options: {},
    });
    expect(res.status).toBe('success');
    // 2 single points (suction header, station power); 7 order-2 sets:
    // four two-train combinations + three sensor pairs from the 2oo3 vote.
    expect(res.metrics.cut_set_count).toBe(9);
    expect(res.contributions.cut_set_order).toEqual({ order_1: 2, order_2: 7 });
  });

  it('ranks the single point of failure above the likelier redundant one', async () => {
    const res = await analyze({
      modelIR: faultTreeToModelIR(nodes, edges),
      method: 'importance_measures',
      options: {},
    });
    const fv = res.contributions.fussell_vesely;
    // Station power (p=0.004) outranks pump A (p=0.02) five-to-one on likelihood
    // reversed, because power is a single point and pumps only matter in pairs.
    expect(fv['event-6']).toBeGreaterThan(fv['event-1']);
    expect(res.metrics.probability as number).toBeCloseTo(0.0059, 3);
  });
});

describe('examples/rbd-cooling-water.json', () => {
  const { nodes, edges } = loadExample('rbd-cooling-water.json');

  it('is a genuine non-series-parallel network — the cross-tie adds a third path', async () => {
    const ir = rbdToModelIR(nodes, edges, 8760);
    expect(ir).not.toBeNull();

    const res = await analyze({ modelIR: ir!, method: 'reliability', options: {} });
    expect(res.status).toBe('success');
    // {PMP-A,HX-A}, {PMP-B,HX-B}, {PMP-A,XTIE,HX-B}
    expect(res.metrics.path_set_count).toBe(3);
    expect(res.metrics.reliability as number).toBeGreaterThan(0.9);
    expect(res.metrics.reliability as number).toBeLessThan(1);
  });
});

describe('examples/event-tree-cooling-loss.json', () => {
  const { nodes, edges } = loadExample('event-tree-cooling-loss.json');

  it('consequence probabilities sum back to the initiating frequency', async () => {
    const ir = eventTreeToModelIR(nodes, edges);
    expect(ir).not.toBeNull();

    const res = await analyze({ modelIR: ir!, method: 'frequency', options: {} });
    expect(res.status).toBe('success');
    expect(res.metrics.total as number).toBeCloseTo(0.05, 10);

    const c = res.contributions.consequence;
    expect(c['Safe shutdown']).toBeCloseTo(0.0432, 6);
    expect(c['Plant trip']).toBeCloseTo(0.0048, 6);
    expect(c['Equipment damage']).toBeCloseTo(0.002, 6);
  });
});

describe('examples/bow-tie-cooling-loss.json', () => {
  const { nodes, edges } = loadExample('bow-tie-cooling-loss.json');

  it('uses each threat’s likelihood — not the solver’s default of 1', async () => {
    const ir = bowTieToModelIR(nodes, edges);
    expect(ir).not.toBeNull();

    const res = await analyze({ modelIR: ir!, method: 'frequency', options: {} });
    expect(res.status).toBe('success');

    // Pump seal: 0.12 likelihood through a 0.90 barrier -> 0.012 leak.
    // If threat probability were ignored (defaulting to 1) this would be 0.10.
    const t = res.contributions.threat;
    expect(t['Pump seal failure']).toBeCloseTo(0.012, 6);
    expect(t['Loss of station power']).toBeCloseTo(0.0015, 6);

    // The common threat behind the better barrier still leaks more than the
    // rare one behind the best barrier — the point of the example.
    expect(t['Pump seal failure']).toBeGreaterThan(t['Loss of station power']);
    expect(res.metrics.top_event_probability as number).toBeCloseTo(0.02236, 4);
  });
});

import { describe, it, expect } from 'vitest';
import { createDefaultModelIR, type ModelIR } from '../../../src/ir/schema.js';
import type { AnalysisMethod, AnalyzeRequest } from '../../../src/solvers/interface.js';
import { analyze } from '../../../src/solvers/index.js';
import { minimalCutSets, topProbability } from '../../../src/solvers/faultTree.js';
import { solveLinear, invert, matExp, multiply } from '../../../src/solvers/linalg.js';

const req = (modelIR: ModelIR, method: AnalysisMethod, options = {}): AnalyzeRequest => ({
  modelIR,
  method,
  options,
  executionTarget: 'browser',
});

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

// ───────────────────────── linalg ─────────────────────────
describe('linalg', () => {
  it('solves a linear system', () => {
    const x = solveLinear(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    close(x[0], 0.8);
    close(x[1], 1.4);
  });

  it('inverts a matrix (A·A⁻¹ = I)', () => {
    const A = [
      [4, 7],
      [2, 6],
    ];
    const I = multiply(A, invert(A));
    close(I[0][0], 1);
    close(I[1][1], 1);
    close(I[0][1], 0);
  });

  it('matrix exponential matches the analytic 2-state result', () => {
    // Q: state0 →1 at rate 1; state1 absorbing.  P00(t)=e^{-t}, P01(t)=1-e^{-t}.
    const P = matExp(
      [
        [-1, 1],
        [0, 0],
      ],
      1,
    );
    close(P[0][0], Math.exp(-1), 1e-9);
    close(P[0][1], 1 - Math.exp(-1), 1e-9);
    close(P[1][1], 1);
  });
});

// ───────────────────────── Markov ─────────────────────────
function repairable(lambda: number, mu: number): ModelIR {
  const ir = createDefaultModelIR('markov_chain');
  ir.states = [
    { id: 'S0', label: 'Up', type: 'operational' },
    { id: 'S1', label: 'Down', type: 'failed' },
  ];
  ir.transitions = [
    { id: 't0', from: 'S0', to: 'S1', rate: lambda },
    { id: 't1', from: 'S1', to: 'S0', rate: mu },
  ];
  ir.initialCondition = { type: 'single', stateId: 'S0' };
  return ir;
}

function absorbing(lambda: number): ModelIR {
  const ir = createDefaultModelIR('markov_chain');
  ir.states = [
    { id: 'S0', label: 'Up', type: 'operational' },
    { id: 'S1', label: 'Failed', type: 'absorbing' },
  ];
  ir.transitions = [{ id: 't0', from: 'S0', to: 'S1', rate: lambda }];
  ir.initialCondition = { type: 'single', stateId: 'S0' };
  return ir;
}

describe('Markov solver', () => {
  const lambda = 0.001;
  const mu = 0.01;

  it('steady-state availability = μ/(λ+μ)', async () => {
    const r = await analyze(req(repairable(lambda, mu), 'availability'));
    expect(r.status).toBe('success');
    close(r.metrics.availability as number, mu / (lambda + mu));
  });

  it('transient availability matches the closed form', async () => {
    const t = 50;
    const r = await analyze(req(repairable(lambda, mu), 'transient', { timePoints: [0, t] }));
    const avail = r.metrics.availability as number[];
    close(avail[0], 1); // A(0) = 1
    const expected = mu / (lambda + mu) + (lambda / (lambda + mu)) * Math.exp(-(lambda + mu) * t);
    close(avail[1], expected, 1e-6);
  });

  it('MTTF = 1/λ for a single failure transition to an absorbing state', async () => {
    const r = await analyze(req(absorbing(lambda), 'mttf'));
    expect(r.status).toBe('success');
    close(r.metrics.mttf as number, 1 / lambda, 1e-3);
  });

  it('reliability = e^{−λt} at mission time', async () => {
    const ir = absorbing(lambda);
    ir.missionTime = 100;
    const r = await analyze(req(ir, 'reliability'));
    close(r.metrics.reliability as number, Math.exp(-lambda * 100), 1e-6);
  });

  it('populates provenance metadata', async () => {
    const r = await analyze(req(repairable(lambda, mu), 'availability'));
    expect(r.solver.name).toBe('markov-solver');
    expect(r.contentHash).toMatch(/^fnv1a-/);
    expect(r.numericMetadata.method).toContain('linear-system');
    expect(r.trace.assumptions.length).toBeGreaterThan(0);
  });
});

// ───────────────────────── RBD ─────────────────────────
function rbd(
  structure: 'series' | 'parallel' | 'k_of_n',
  n: number,
  lambda: number,
  k?: number,
): ModelIR {
  const ir = createDefaultModelIR('reliability_block_diagram');
  ir.missionTime = 1;
  ir.components = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `C${i}`,
    failureRate: lambda,
    metadata: {},
  }));
  ir.blocks = [
    { id: 'sys', name: 'System', type: structure, k, children: ir.components.map((c) => c.id) },
  ];
  return ir;
}

describe('RBD solver', () => {
  const lambda = -Math.log(0.9); // R = e^{−λ·1} = 0.9

  it('series reliability = ∏R', async () => {
    const r = await analyze(req(rbd('series', 2, lambda), 'reliability'));
    close(r.metrics.reliability as number, 0.81, 1e-6);
  });

  it('parallel reliability = 1−∏(1−R)', async () => {
    const r = await analyze(req(rbd('parallel', 2, lambda), 'reliability'));
    close(r.metrics.reliability as number, 0.99, 1e-6);
  });

  it('2-of-3 reliability = 3R²−2R³', async () => {
    const r = await analyze(req(rbd('k_of_n', 3, lambda, 2), 'reliability'));
    const R = 0.9;
    close(r.metrics.reliability as number, 3 * R * R - 2 * R * R * R, 1e-6);
  });
});

// ───────────────────────── RBD network (non-series-parallel) ─────────────────────────
import { minimalPathSets } from '../../../src/solvers/rbdNetwork.js';

function rbdNet(
  components: Array<{ id: string; lambda: number }>,
  connections: Array<[string, string]>,
): ModelIR {
  const ir = createDefaultModelIR('reliability_block_diagram');
  ir.missionTime = 1;
  ir.components = components.map((c) => ({
    id: c.id,
    name: c.id,
    failureRate: c.lambda,
    metadata: {},
  }));
  ir.rbdNetwork = {
    source: 'IN',
    sink: 'OUT',
    connections: connections.map(([from, to]) => ({ from, to })),
  };
  return ir;
}

describe('RBD network solver', () => {
  const lambda = -Math.log(0.9); // R = 0.9 at t=1

  it('series network reliability = 0.81', async () => {
    const ir = rbdNet(
      [
        { id: 'a', lambda },
        { id: 'b', lambda },
      ],
      [
        ['IN', 'a'],
        ['a', 'b'],
        ['b', 'OUT'],
      ],
    );
    const r = await analyze(req(ir, 'reliability'));
    close(r.metrics.reliability as number, 0.81, 1e-6);
  });

  it('parallel network reliability = 0.99', async () => {
    const ir = rbdNet(
      [
        { id: 'a', lambda },
        { id: 'b', lambda },
      ],
      [
        ['IN', 'a'],
        ['IN', 'b'],
        ['a', 'OUT'],
        ['b', 'OUT'],
      ],
    );
    const r = await analyze(req(ir, 'reliability'));
    close(r.metrics.reliability as number, 0.99, 1e-6);
  });

  it('directed bridge (non-series-parallel) matches 2p²+p³−3p⁴+p⁵', async () => {
    // IN→a, IN→b, a→b (bridge), a→OUT, b→OUT
    const ir = rbdNet(
      [
        { id: 'sa', lambda }, // IN→a leg
        { id: 'sb', lambda }, // IN→b leg
        { id: 'ab', lambda }, // bridge a→b
        { id: 'at', lambda }, // a→OUT leg
        { id: 'bt', lambda }, // b→OUT leg
      ],
      [
        ['IN', 'sa'],
        ['sa', 'A'],
        ['IN', 'sb'],
        ['sb', 'B'],
        ['A', 'ab'],
        ['ab', 'B'],
        ['A', 'at'],
        ['at', 'OUT'],
        ['B', 'bt'],
        ['bt', 'OUT'],
      ],
    );
    const paths = minimalPathSets(ir.rbdNetwork!, (id) =>
      ['sa', 'sb', 'ab', 'at', 'bt'].includes(id),
    );
    expect(paths).toHaveLength(3); // {sa,at}, {sb,bt}, {sa,ab,bt}
    const r = await analyze(req(ir, 'reliability'));
    const p = 0.9;
    close(r.metrics.reliability as number, 2 * p ** 2 + p ** 3 - 3 * p ** 4 + p ** 5, 1e-6);
  });

  it('Monte Carlo converges to the series result', async () => {
    const ir = rbdNet(
      [
        { id: 'a', lambda },
        { id: 'b', lambda },
      ],
      [
        ['IN', 'a'],
        ['a', 'b'],
        ['b', 'OUT'],
      ],
    );
    const r = await analyze(
      req(ir, 'monte_carlo_simulation', { monteCarloSamples: 40000, seed: 7 }),
    );
    close(r.metrics.reliability as number, 0.81, 0.01);
  });
});

// ───────────────────────── Fault tree ─────────────────────────
function ft(gateType: 'AND' | 'OR', p: number): ModelIR {
  const ir = createDefaultModelIR('fault_tree');
  ir.events = [
    { id: 'a', name: 'A', type: 'basic', probability: p },
    { id: 'b', name: 'B', type: 'basic', probability: p },
    { id: 'top', name: 'Top', type: 'top' },
  ];
  ir.gates = [{ id: 'g1', type: gateType, inputs: ['a', 'b'], output: 'top' }];
  return ir;
}

describe('Fault tree solver', () => {
  it('AND gate → single cut set {a,b}, P = p·p', async () => {
    const ir = ft('AND', 0.1);
    const cuts = minimalCutSets(ir);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].sort()).toEqual(['a', 'b']);
    const r = await analyze(req(ir, 'reliability'));
    close(r.metrics.probability as number, 0.01);
  });

  it('OR gate → cut sets {a},{b}, P = 1−(1−p)²', async () => {
    const ir = ft('OR', 0.1);
    const cuts = minimalCutSets(ir);
    expect(cuts).toHaveLength(2);
    const r = await analyze(req(ir, 'reliability'));
    close(r.metrics.probability as number, 1 - 0.9 * 0.9);
  });

  it('K_OF_N gate → cut sets are k-combinations', () => {
    const ir = createDefaultModelIR('fault_tree');
    ir.events = [
      { id: 'a', name: 'A', type: 'basic', probability: 0.1 },
      { id: 'b', name: 'B', type: 'basic', probability: 0.1 },
      { id: 'c', name: 'C', type: 'basic', probability: 0.1 },
      { id: 'top', name: 'Top', type: 'top' },
    ];
    ir.gates = [{ id: 'g1', type: 'K_OF_N', k: 2, inputs: ['a', 'b', 'c'], output: 'top' }];
    const cuts = minimalCutSets(ir);
    expect(cuts).toHaveLength(3); // {a,b},{a,c},{b,c}
    expect(cuts.every((c) => c.length === 2)).toBe(true);
  });

  it('importance measures match hand calculations for an OR gate', async () => {
    const r = await analyze(req(ft('OR', 0.1), 'importance_measures'));
    const pTop = 1 - 0.9 * 0.9; // 0.19
    close(r.contributions.birnbaum.a, 0.9); // P(top|a=1)−P(top|a=0) = 1 − 0.1
    close(r.contributions.fussell_vesely.a, 0.1 / pTop);
    close(r.contributions.raw.a, 1 / pTop);
  });

  it('topProbability uses inclusion–exclusion for overlapping cut sets', () => {
    // Cut sets {a},{a,b}: {a,b} is a superset, but test the raw function directly.
    const p = topProbability([['a'], ['b']], (x) => (x === 'a' ? 0.2 : 0.3));
    close(p, 1 - 0.8 * 0.7); // 0.44
  });
});

// ───────────────────────── Event tree ─────────────────────────
describe('Event tree solver', () => {
  function et(): ModelIR {
    const ir = createDefaultModelIR('event_tree');
    // IE → headerA (success 0.9 / failure 0.1) → headerB (success 0.8 / failure 0.2) → consequences
    ir.eventTree = {
      initiatingId: 'IE',
      initiatingProbability: 1,
      labels: { IE: 'Init', C1: 'OK', C2: 'Degraded', C3: 'Failed', C4: 'Loss' },
      branches: [
        { from: 'IE', to: 'a_s', probability: 0.9, branchType: 'success' },
        { from: 'IE', to: 'a_f', probability: 0.1, branchType: 'failure' },
        { from: 'a_s', to: 'C1', probability: 0.8, branchType: 'success' },
        { from: 'a_s', to: 'C2', probability: 0.2, branchType: 'failure' },
        { from: 'a_f', to: 'C3', probability: 0.8, branchType: 'success' },
        { from: 'a_f', to: 'C4', probability: 0.2, branchType: 'failure' },
      ],
    };
    return ir;
  }

  it('computes consequence probabilities = product of branch probabilities', async () => {
    const r = await analyze(req(et(), 'frequency'));
    expect(r.status).toBe('success');
    close(r.contributions.consequence.OK, 0.72); // 0.9·0.8
    close(r.contributions.consequence.Degraded, 0.18); // 0.9·0.2
    close(r.contributions.consequence.Failed, 0.08); // 0.1·0.8
    close(r.contributions.consequence.Loss, 0.02); // 0.1·0.2
    close(r.metrics.total as number, 1); // exhaustive tree sums to the initiating value
  });

  it('warns when a node’s branch probabilities do not sum to 1', async () => {
    const ir = et();
    ir.eventTree!.branches[0].probability = 0.5; // 0.5 + 0.1 ≠ 1 at IE
    const r = await analyze(req(ir, 'frequency'));
    expect(r.warnings.some((w) => w.code === 'branch_sum')).toBe(true);
  });
});

// ───────────────────────── Bow-tie ─────────────────────────
describe('Bow-tie solver', () => {
  function bt(): ModelIR {
    const ir = createDefaultModelIR('bow_tie');
    // Threat → PB(eff 0.9) → Top → MB(eff 0.8) → escalated consequence; + direct minor consequence.
    ir.bowTie = {
      topEventId: 'top',
      labels: {
        T: 'Corrosion',
        PB: 'Coating',
        top: 'Leak',
        MB: 'Bund',
        Cmajor: 'Spill',
        Cminor: 'Contained',
      },
      nodes: [
        { id: 'T', kind: 'threat' },
        { id: 'PB', kind: 'preventive_barrier', effectiveness: 0.9 },
        { id: 'top', kind: 'top_event' },
        { id: 'MB', kind: 'mitigative_barrier', effectiveness: 0.8 },
        { id: 'Cmajor', kind: 'consequence' },
        { id: 'Cminor', kind: 'consequence' },
      ],
      edges: [
        { from: 'T', to: 'PB' },
        { from: 'PB', to: 'top' },
        { from: 'top', to: 'MB' },
        { from: 'MB', to: 'Cmajor' }, // reached when MB fails
        { from: 'top', to: 'Cminor' }, // direct outcome
      ],
    };
    return ir;
  }

  it('computes top-event and consequence probabilities through barriers', async () => {
    const r = await analyze(req(bt(), 'frequency'));
    expect(r.status).toBe('success');
    close(r.metrics.top_event_probability as number, 0.1); // threat 1 × (1−0.9), OR over one threat
    close(r.contributions.consequence.Spill, 0.02); // P(top) 0.1 × (1−0.8)
    close(r.contributions.consequence.Contained, 0.1); // direct from top
  });

  it('errors on unsupported method', async () => {
    const r = await analyze(req(bt(), 'reliability'));
    expect(r.status).toBe('error');
  });
});

// ───────────────────────── Dispatcher ─────────────────────────
describe('analyze dispatcher', () => {
  it('errors on unsupported method', async () => {
    const r = await analyze(req(repairable(0.001, 0.01), 'monte_carlo_simulation'));
    expect(r.status).toBe('error');
  });

  it('errors on a method not supported by the diagram type', async () => {
    const r = await analyze(req(ft('AND', 0.1), 'mttf'));
    expect(r.status).toBe('error');
  });
});

// ───────────────────────── Deferred methods ─────────────────────────
describe('Markov frequency metrics', () => {
  const lambda = 0.001;
  const mu = 0.01;
  const nu = (lambda * mu) / (lambda + mu); // failure frequency

  it('frequency, MTBF, MTTR match closed forms', async () => {
    const ir = repairable(lambda, mu);
    ir.missionTime = 1000;
    const r = await analyze(req(ir, 'mtbf'));
    close(r.metrics.frequency as number, nu, 1e-9);
    close(r.metrics.mtbf as number, 1 / nu, 1e-3);
    close(r.metrics.mttr as number, 1 / mu, 1e-3); // (1−A)/ν = 1/μ
    close(r.metrics.expected_number_of_failures as number, nu * 1000, 1e-6);
  });
});

describe('sensitivity', () => {
  it('Markov availability falls with failure rate, rises with repair rate', async () => {
    const r = await analyze(req(repairable(0.001, 0.01), 'sensitivity'));
    expect(r.contributions.sensitivity.t0).toBeLessThan(0); // ↑λ ⇒ ↓availability
    expect(r.contributions.sensitivity.t1).toBeGreaterThan(0); // ↑μ ⇒ ↑availability
  });

  it('FTA sensitivity equals normalized Birnbaum', async () => {
    const r = await analyze(req(ft('OR', 0.1), 'sensitivity'));
    const pTop = 1 - 0.9 * 0.9;
    close(r.contributions.sensitivity.a, (0.9 * 0.1) / pTop); // Birnbaum·p/P
  });
});

describe('Monte Carlo converges to the exact result', () => {
  it('RBD series MC ≈ 0.81', async () => {
    const r = await analyze(
      req(rbd('series', 2, -Math.log(0.9)), 'monte_carlo_simulation', {
        monteCarloSamples: 40000,
        seed: 7,
      }),
    );
    close(r.metrics.reliability as number, 0.81, 0.01);
    expect(r.errorBounds.reliability.lower).toBeLessThan(0.81);
    expect(r.errorBounds.reliability.upper).toBeGreaterThan(0.81);
  });

  it('FTA OR-gate MC ≈ 0.19', async () => {
    const r = await analyze(
      req(ft('OR', 0.1), 'monte_carlo_simulation', { monteCarloSamples: 40000, seed: 7 }),
    );
    close(r.metrics.probability as number, 0.19, 0.01);
  });
});

describe('RBD uncertainty propagation', () => {
  it('a constant distribution yields the deterministic reliability', async () => {
    const lambda = -Math.log(0.9);
    const ir = createDefaultModelIR('reliability_block_diagram');
    ir.missionTime = 1;
    ir.components = [
      { id: 'c0', name: 'C0', failureRate: lambda, distribution: 'd1', metadata: {} },
    ];
    ir.distributions = [{ id: 'd1', type: 'constant', params: { value: lambda } }];
    ir.blocks = [{ id: 'sys', name: 'S', type: 'series', children: ['c0'] }];
    const r = await analyze(req(ir, 'uncertainty_propagation', { monteCarloSamples: 500 }));
    close(r.metrics.reliability_mean as number, 0.9, 1e-9);
    close(r.errorBounds.reliability.lower, 0.9, 1e-9);
  });
});

describe('Fault tree common-cause failure (beta-factor)', () => {
  it('matches the analytic beta-factor result for two redundant events', async () => {
    const beta = 0.1;
    const p = 0.01;
    const ir = createDefaultModelIR('fault_tree');
    ir.events = [
      { id: 'a', name: 'A', type: 'basic', probability: p },
      { id: 'b', name: 'B', type: 'basic', probability: p },
      { id: 'top', name: 'Top', type: 'top' },
    ];
    ir.gates = [{ id: 'g1', type: 'AND', inputs: ['a', 'b'], output: 'top' }];
    ir.dependencies = [
      {
        kind: 'common_cause_failure',
        id: 'ccf1',
        name: 'Shared',
        affectedComponents: ['a', 'b'],
        beta,
        model: 'beta_factor',
      },
    ];
    const r = await analyze(req(ir, 'common_cause_failure'));
    const ind = (1 - beta) * p;
    const expected = ind * ind + beta * p - ind * ind * (beta * p); // {a_ind,b_ind} ∪ {ccf}
    close(r.metrics.probability as number, expected, 1e-9);
  });
});

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

  // Uniformization seeds the Poisson recurrence at e^{-Λt}, which is exactly 0
  // in float64 once Λt > 745 — every term then contributes nothing and the
  // result is an all-zero matrix. Just below that, the seed is denormal and the
  // series loses most of its precision. Both regimes are silent: the numbers
  // look like answers. A row of a transition-probability matrix must sum to 1,
  // so the row sum catches either failure without needing a reference value.
  describe('matrix exponential past the Poisson underflow horizon', () => {
    // Symmetric two-state chain: Λ = 1, so Λt = t and the horizon is t ≈ 745.
    // P00(t) = ½(1 + e^{−2t}), which stays a comfortable 0.5 out to any t.
    const SYMMETRIC: number[][] = [
      [-1, 1],
      [1, -1],
    ];

    it('stays a probability matrix well past the horizon', () => {
      const P = matExp(SYMMETRIC, 1000);
      close(P[0][0] + P[0][1], 1, 1e-9);
      close(P[1][0] + P[1][1], 1, 1e-9);
    });

    it('matches the analytic result well past the horizon', () => {
      const P = matExp(SYMMETRIC, 1000);
      close(P[0][0], 0.5, 1e-9);
      close(P[0][1], 0.5, 1e-9);
    });

    it('keeps full precision at the horizon, where the seed goes denormal', () => {
      const P = matExp(SYMMETRIC, 745);
      close(P[0][0] + P[0][1], 1, 1e-9);
      close(P[0][0], 0.5, 1e-9);
    });

    it('is continuous across the horizon', () => {
      const before = matExp(SYMMETRIC, 744)[0][0];
      const after = matExp(SYMMETRIC, 746)[0][0];
      close(after, before, 1e-9);
    });
  });

  // Scaling and squaring buys a representable seed, but the squarings also
  // compound whatever the series left on the table: it stops once the Poisson
  // tail is under `tol`, leaving rows summing to 1−tol, and every squaring
  // doubles that deficit. Unchecked, the result is sub-stochastic by 2^k·tol —
  // orders of magnitude past the documented tolerance, and enough to show up as
  // a fake trend once a caller plots it.
  describe('matrix exponential accuracy under squaring', () => {
    // A fast repair (Λ = 0.3002) so a one-year mission needs several squarings.
    const REPAIRABLE_WITH_FAILURE: number[][] = [
      [-0.0004, 0.0004, 0],
      [0.3, -0.3002, 0.0002],
      [0, 0, 0],
    ];

    it('keeps rows stochastic to tolerance however many squarings it takes', () => {
      for (const t of [500, 2000, 4000, 8000, 8760, 40000]) {
        const rowSum = matExp(REPAIRABLE_WITH_FAILURE, t)[0].reduce((a, b) => a + b, 0);
        expect(Math.abs(1 - rowSum)).toBeLessThan(1e-12);
      }
    });

    // A chain with no absorbing state cannot fail, so P(up) is exactly 1 for
    // all t. Any spread here is pure round-off, and a caller that scales an
    // axis to its data will magnify it into a decay that does not exist.
    it('holds a no-failure chain at exactly 1', () => {
      const noFailure: number[][] = [
        [-0.0004, 0.0004],
        [0.3, -0.3],
      ];
      const sums = [0, 876, 2628, 4380, 8760, 40000].map((t) =>
        matExp(noFailure, t)[0].reduce((a, b) => a + b, 0),
      );
      expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(1e-12);
    });
  });

  // A negative or non-finite t is not a value this can answer for, and both
  // used to fail silently: NaN propagated through the term count so the series
  // never ran and the freshly zeroed accumulator was returned — zeros dressed
  // up as results, the very thing the underflow fix set out to remove — while
  // an infinite t made the squaring count infinite and the loop never ended.
  describe('matrix exponential input guards', () => {
    const CHAIN: number[][] = [
      [-1, 1],
      [1, -1],
    ];

    it('rejects a negative t rather than returning zeros', () => {
      expect(() => matExp(CHAIN, -5)).toThrow(RangeError);
    });

    it('rejects a non-finite t rather than looping forever', () => {
      expect(() => matExp(CHAIN, Infinity)).toThrow(RangeError);
      expect(() => matExp(CHAIN, NaN)).toThrow(RangeError);
    });

    // Guarding `t` alone is not enough: it is Λ·t that sizes the work, and it
    // can overflow while t itself is a perfectly ordinary finite number. The
    // squaring count then becomes Infinity and the loop never ends — in the
    // analysis worker, which has no timeout, so the panel waits forever.
    it('rejects a finite t whose Λ·t overflows', () => {
      // Λ = 2, so Λ·t tips over float64's ceiling while t itself is finite.
      const fast: number[][] = [
        [-2, 2],
        [2, -2],
      ];
      expect(() => matExp(fast, 1e308)).toThrow(RangeError);
    });
  });

  // The series stops once its Poisson tail is worth less than stepTol, and
  // stepTol shrinks by 2^k so the *final* matrix can hold `tol`. Past ~2^13 that
  // target falls under float64's resolution near 1, so the break can never fire
  // and the accumulated error runs free — including past 1, which is how a
  // probability ends up super-stochastic.
  describe('matrix exponential at a high uniformization rate', () => {
    // Λ ≈ 1000 (a fast repair), so a one-year mission needs ~17 squarings.
    const FAST: number[][] = [
      [-1e-4, 1e-4, 0],
      [1000, -1000.00001, 1e-5],
      [0, 0, 0],
    ];

    it('still holds the documented tolerance', () => {
      for (const t of [8760, 20000, 87600]) {
        const rowSum = matExp(FAST, t)[0].reduce((a, b) => a + b, 0);
        expect(Math.abs(1 - rowSum)).toBeLessThan(1e-12);
      }
    });

    it('never returns a probability above 1', () => {
      for (const t of [8760, 20000, 87600]) {
        for (const row of matExp(FAST, t)) {
          for (const p of row) expect(p).toBeLessThanOrEqual(1);
        }
      }
    });
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

/**
 * Up ⇄ Degraded on a fast repair, with a slow absorbing failure out of
 * Degraded. The fast repair sets the uniformization rate (Λ = 0.3) while
 * absorption is slow, so Λ·t crosses the float64 underflow horizon (t ≈ 2483 h)
 * a third of the way into a one-year mission.
 */
function repairableWithAbsorbingFailure(): ModelIR {
  const ir = createDefaultModelIR('markov_chain');
  ir.states = [
    { id: 'S0', label: 'Up', type: 'operational' },
    { id: 'S1', label: 'Degraded', type: 'degraded' },
    { id: 'S2', label: 'Failed', type: 'absorbing' },
  ];
  ir.transitions = [
    { id: 't0', from: 'S0', to: 'S1', rate: 0.0004 },
    { id: 't1', from: 'S1', to: 'S0', rate: 0.3 },
    { id: 't2', from: 'S1', to: 'S2', rate: 0.0002 },
  ];
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

  // A uniform grid lets one exp(Q·Δt) serve every point, stepped forward by
  // multiplication instead of solving the exponential 61 times over. The saving
  // is only sound if every point still lands on the closed form — stepping
  // accumulates its own rounding — so this checks all of them, not just the last.
  describe('transient over a uniform grid', () => {
    const closedForm = (t: number) =>
      mu / (lambda + mu) + (lambda / (lambda + mu)) * Math.exp(-(lambda + mu) * t);

    it('matches the closed form at every point', async () => {
      const timePoints = Array.from({ length: 61 }, (_, i) => (8760 * i) / 60);
      const r = await analyze(req(repairable(lambda, mu), 'transient', { timePoints }));
      const avail = r.metrics.availability as number[];

      expect(avail).toHaveLength(timePoints.length);
      timePoints.forEach((t, i) => close(avail[i], closedForm(t), 1e-9));
    });

    // timePoints is an arbitrary array on the API, so the even spacing the panel
    // happens to send is not something the solver may assume.
    it('matches the closed form on an uneven grid too', async () => {
      const timePoints = [0, 1, 7, 100, 2500, 8760];
      const r = await analyze(req(repairable(lambda, mu), 'transient', { timePoints }));
      const avail = r.metrics.availability as number[];

      timePoints.forEach((t, i) => close(avail[i], closedForm(t), 1e-9));
    });

    it('handles a grid that does not start at zero', async () => {
      const timePoints = [100, 200, 300, 400];
      const r = await analyze(req(repairable(lambda, mu), 'transient', { timePoints }));
      const avail = r.metrics.availability as number[];

      timePoints.forEach((t, i) => close(avail[i], closedForm(t), 1e-9));
    });
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

  // The uniformization rate is the largest total exit rate in the chain, so a
  // fast repair sets it while the slow failure sets the timescale of interest.
  // That combination — normal for a repairable system — puts Λ·t past the
  // underflow horizon well inside a one-year mission, which is where the
  // solver used to start returning zeros dressed up as results.
  describe('a one-year mission on a chain with a fast repair rate', () => {
    // Λ = μ = 0.3, so the horizon lands at t ≈ 2483 h, a third of the way in.
    const FAST_MU = 0.3;
    const SLOW_LAMBDA = 0.0004;
    const YEAR = 8760;

    it('transient availability holds its plateau instead of collapsing to zero', async () => {
      const r = await analyze(
        req(repairable(SLOW_LAMBDA, FAST_MU), 'transient', { timePoints: [0, YEAR] }),
      );
      const avail = r.metrics.availability as number[];
      const steady = FAST_MU / (SLOW_LAMBDA + FAST_MU);
      const expected =
        steady +
        (SLOW_LAMBDA / (SLOW_LAMBDA + FAST_MU)) * Math.exp(-(SLOW_LAMBDA + FAST_MU) * YEAR);
      close(avail[1], expected, 1e-9);
    });

    it('never reports availability above 1', async () => {
      const r = await analyze(
        req(repairable(SLOW_LAMBDA, FAST_MU), 'transient', {
          // Straddles the horizon, including the denormal-seed region.
          timePoints: [2400, 2483, 2484, 5000, YEAR],
        }),
      );
      for (const a of r.metrics.availability as number[]) {
        expect(a).toBeLessThanOrEqual(1);
        expect(a).toBeGreaterThan(0);
      }
    });
  });

  // Survival probability is non-increasing in mission time. The underflow made
  // reliability read exactly 1.0 past the horizon — a longer mission looking
  // *safer* than a shorter one, and the most dangerous shape this bug takes:
  // a plausible, perfect number.
  it('reliability never increases with a longer mission', async () => {
    const missions = [1000, 2400, 2483, 2600, 5000, 8760];
    const values: number[] = [];
    for (const missionTime of missions) {
      const ir = repairableWithAbsorbingFailure();
      ir.missionTime = missionTime;
      values.push((await analyze(req(ir, 'reliability'))).metrics.reliability as number);
    }
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
    expect(values[values.length - 1]).toBeLessThan(1);
  });

  // Every response stamps the solver version so a stored number can be traced
  // to the code that produced it — which is also what the frontend's cache
  // invalidation reasons about. errorResponse wrote a literal '0.1.0', so the
  // moment any solver moved off that version its errors started lying.
  it('reports the same solver version on error as on success', async () => {
    const ok = await analyze(req(repairable(lambda, mu), 'availability'));

    const noStates = createDefaultModelIR('markov_chain');
    noStates.states = [];
    const modelError = await analyze(req(noStates, 'availability'));

    const unsupported = await analyze(req(repairable(lambda, mu), 'minimal_cut_sets'));

    expect(modelError.status).toBe('error');
    expect(unsupported.status).toBe('error');
    expect(modelError.solver.version).toBe(ok.solver.version);
    expect(unsupported.solver.version).toBe(ok.solver.version);
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

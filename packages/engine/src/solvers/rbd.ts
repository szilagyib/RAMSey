import type { Block, Distribution } from '../ir/schema.js';
import type {
  AnalysisMethod,
  AnalyzeRequest,
  AnalyzeResponse,
  Solver,
  Warning,
} from './interface.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';
import { mulberry32, sampleDistribution } from './random.js';
import { analyzeNetwork } from './rbdNetwork.js';

const NAME = 'rbd-solver';
const VERSION = '0.1.0';

/** Probability at least k of the given element reliabilities are working. */
function kOfN(rs: number[], k: number): number {
  let dp = [1];
  for (const r of rs) {
    const next = new Array(dp.length + 1).fill(0);
    for (let w = 0; w < dp.length; w++) {
      next[w] += dp[w] * (1 - r);
      next[w + 1] += dp[w] * r;
    }
    dp = next;
  }
  let p = 0;
  for (let w = k; w < dp.length; w++) p += dp[w];
  return p;
}

function combine(block: Block, rs: number[], warnings: Warning[]): number {
  switch (block.type) {
    case 'series':
      return rs.reduce((p, r) => p * r, 1);
    case 'parallel':
      return 1 - rs.reduce((p, r) => p * (1 - r), 1);
    case 'k_of_n': {
      const k = block.k ?? rs.length;
      if (k < 1 || k > rs.length)
        warnings.push({
          code: 'bad_k',
          message: `Block ${block.id}: k=${k} out of range; clamping.`,
        });
      return kOfN(rs, Math.min(Math.max(k, 1), rs.length));
    }
    default:
      return rs.reduce((p, r) => p * r, 1);
  }
}

export class RbdSolver implements Solver {
  readonly name = NAME;
  readonly version = VERSION;
  readonly supportedMethods: AnalysisMethod[] = [
    'reliability',
    'availability',
    'sensitivity',
    'monte_carlo_simulation',
    'uncertainty_propagation',
  ];

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const start = Date.now();
    const ir = req.modelIR;
    const warnings: Warning[] = [];

    // A general network (any topology, incl. non-series-parallel) takes precedence
    // over nested blocks.
    if (ir.rbdNetwork) {
      return analyzeNetwork(req, ir.rbdNetwork);
    }

    if (ir.blocks.length === 0) {
      return errorResponse(ir, req.method, 'RBD model has no blocks', NAME, start);
    }

    const mt = resolveValue(
      req.options.missionTime ?? ir.missionTime,
      ir.parameters,
      warnings,
      'mission time',
      0,
    );
    const components = new Map(ir.components.map((c) => [c.id, c]));
    const blocks = new Map(ir.blocks.map((b) => [b.id, b]));
    const distributions = new Map<string, Distribution>(ir.distributions.map((d) => [d.id, d]));

    // Root = block not referenced as any block's child.
    const childIds = new Set<string>();
    for (const b of ir.blocks) for (const c of b.children) childIds.add(c);
    const roots = ir.blocks.filter((b) => !childIds.has(b.id));
    if (roots.length !== 1) {
      warnings.push({
        code: 'ambiguous_root',
        message: `Expected one root block, found ${roots.length}; using the first.`,
      });
    }
    const root = roots[0] ?? ir.blocks[0];

    const lambdaOf = (id: string): number =>
      resolveValue(
        components.get(id)?.failureRate,
        ir.parameters,
        warnings,
        `failure rate of ${id}`,
      );

    /** Recursively evaluate the system value given a per-component value function. */
    const systemValue = (valueFn: (compId: string) => number): number => {
      const seen = new Set<string>();
      const ev = (id: string): number => {
        if (seen.has(id)) {
          warnings.push({ code: 'cycle', message: `Cycle at '${id}'; treated as 0.` });
          return 0;
        }
        if (components.has(id)) return valueFn(id);
        const block = blocks.get(id);
        if (!block) {
          warnings.push({ code: 'unknown_ref', message: `Unknown element '${id}'; treated as 1.` });
          return 1;
        }
        seen.add(id);
        const vals = block.children.map(ev);
        seen.delete(id);
        return combine(block, vals, warnings);
      };
      return ev(root.id);
    };

    /** Boolean structure evaluation for Monte Carlo (component works if in upSet). */
    const systemWorks = (upSet: Set<string>): boolean => {
      const ev = (id: string): boolean => {
        if (components.has(id)) return upSet.has(id);
        const block = blocks.get(id);
        if (!block) return true;
        const kids = block.children.map(ev);
        if (block.type === 'series') return kids.every(Boolean);
        if (block.type === 'parallel') return kids.some(Boolean);
        const k = Math.min(Math.max(block.k ?? kids.length, 1), kids.length);
        return kids.filter(Boolean).length >= k;
      };
      return ev(root.id);
    };

    const baseInput = {
      solverName: NAME,
      solverVersion: VERSION,
      modelIR: ir,
      method: req.method,
      startTime: start,
      warnings,
    };

    // ── reliability / availability ──────────────────────────────────────
    if (req.method === 'reliability' || req.method === 'availability') {
      const wantAvail = req.method === 'availability';
      const contributions: Record<string, number> = {};
      const valueFn = (id: string): number => {
        const c = components.get(id)!;
        const lambda = lambdaOf(id);
        let v: number;
        if (wantAvail) {
          if (c.repairRate === undefined) {
            warnings.push({
              code: 'no_repair',
              message: `Component ${id} has no repair rate; using reliability as proxy.`,
            });
            v = Math.exp(-lambda * mt);
          } else {
            const mu = resolveValue(c.repairRate, ir.parameters, warnings, `repair rate of ${id}`);
            v = lambda + mu === 0 ? 1 : mu / (lambda + mu);
          }
        } else {
          v = Math.exp(-lambda * mt);
        }
        contributions[id] = v;
        return v;
      };
      const value = systemValue(valueFn);
      const key = wantAvail ? 'availability' : 'reliability';
      return buildResponse({
        ...baseInput,
        metrics: { [key]: value, mission_time: mt },
        contributions: { [key]: contributions },
        numericMetadata: { method: 'structure-function evaluation' },
        trace: {
          assumptions: [
            wantAvail
              ? 'Steady-state availability A=μ/(λ+μ) per repairable component'
              : 'Exponential time-to-failure; R=e^{−λt}',
            'series ∏R, parallel 1−∏(1−R), k-of-n combinatorial',
          ],
          methodDetails: `Recursive evaluation from root '${root.id}'.`,
        },
      });
    }

    // ── sensitivity (finite difference of system reliability to each λ) ──
    if (req.method === 'sensitivity') {
      const reliabilityFn = (id: string) => Math.exp(-lambdaOf(id) * mt);
      const baseR = systemValue(reliabilityFn);
      const eps = 1e-4;
      const sensitivity: Record<string, number> = {};
      for (const c of ir.components) {
        const lambda = lambdaOf(c.id);
        if (lambda === 0) {
          sensitivity[c.id] = 0;
          continue;
        }
        const perturbed = lambda * (1 + eps);
        const rPert = systemValue((id) =>
          id === c.id ? Math.exp(-perturbed * mt) : Math.exp(-lambdaOf(id) * mt),
        );
        sensitivity[c.id] = baseR !== 0 ? (rPert - baseR) / baseR / eps : 0;
      }
      return buildResponse({
        ...baseInput,
        metrics: { reliability: baseR },
        contributions: { sensitivity },
        numericMetadata: { method: 'finite difference (relative)' },
        trace: {
          assumptions: ['Exponential components'],
          methodDetails: 'Normalized sensitivity of system reliability to each failure rate.',
        },
      });
    }

    // ── Monte Carlo ─────────────────────────────────────────────────────
    if (req.method === 'monte_carlo_simulation') {
      const N = req.options.monteCarloSamples ?? 10000;
      const rng = mulberry32(req.options.seed ?? 12345);
      const reliab = new Map(ir.components.map((c) => [c.id, Math.exp(-lambdaOf(c.id) * mt)]));
      let success = 0;
      for (let s = 0; s < N; s++) {
        const up = new Set<string>();
        for (const c of ir.components) if (rng() < (reliab.get(c.id) ?? 0)) up.add(c.id);
        if (systemWorks(up)) success++;
      }
      const p = success / N;
      const se = Math.sqrt((p * (1 - p)) / N);
      return buildResponse({
        ...baseInput,
        metrics: { reliability: p, samples: N },
        errorBounds: {
          reliability: { lower: Math.max(0, p - 1.96 * se), upper: Math.min(1, p + 1.96 * se) },
        },
        numericMetadata: { method: 'Monte Carlo (Bernoulli sampling)', iterations: N },
        trace: {
          assumptions: ['Independent components; exponential reliability'],
          methodDetails: `${N} samples, seed ${req.options.seed ?? 12345}; 95% CI in errorBounds.`,
        },
      });
    }

    // ── uncertainty propagation (sample failure rates from distributions) ─
    if (req.method === 'uncertainty_propagation') {
      const N = req.options.monteCarloSamples ?? 2000;
      const rng = mulberry32(req.options.seed ?? 12345);
      const linked = ir.components.filter(
        (c) => c.distribution && distributions.has(c.distribution),
      );
      if (linked.length === 0) {
        warnings.push({
          code: 'no_distributions',
          message: 'No components link a distribution; returning deterministic reliability.',
        });
      }
      const sampleLambda = (id: string): number => {
        const c = components.get(id)!;
        if (c.distribution && distributions.has(c.distribution)) {
          const d = distributions.get(c.distribution)!;
          const params: Record<string, number> = {};
          for (const [k, v] of Object.entries(d.params))
            params[k] = resolveValue(v, ir.parameters, warnings, `${d.id}.${k}`);
          return sampleDistribution(d.type, params, rng);
        }
        return lambdaOf(id);
      };
      const samples: number[] = [];
      for (let s = 0; s < N; s++) {
        const lam = new Map(ir.components.map((c) => [c.id, sampleLambda(c.id)]));
        samples.push(systemValue((id) => Math.exp(-(lam.get(id) ?? 0) * mt)));
      }
      samples.sort((a, b) => a - b);
      const mean = samples.reduce((s, v) => s + v, 0) / N;
      const pct = (q: number) => samples[Math.min(N - 1, Math.max(0, Math.floor(q * N)))];
      return buildResponse({
        ...baseInput,
        metrics: { reliability_mean: mean, samples: N },
        errorBounds: { reliability: { lower: pct(0.05), upper: pct(0.95) } },
        numericMetadata: { method: 'Monte Carlo uncertainty propagation', iterations: N },
        trace: {
          assumptions: ['Failure-rate uncertainty from linked distributions'],
          methodDetails: `${N} samples; mean + 5/95 percentiles.`,
        },
      });
    }

    return errorResponse(
      ir,
      req.method,
      `RBD solver does not support method '${req.method}'`,
      NAME,
      start,
    );
  }
}

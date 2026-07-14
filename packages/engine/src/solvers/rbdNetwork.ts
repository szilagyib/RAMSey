import type { ModelIR, RbdNetwork } from '../ir/schema.js';
import type { AnalyzeRequest, AnalyzeResponse, Warning } from './interface.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';
import { topProbability } from './faultTree.js';
import { mulberry32 } from './random.js';

const NAME = 'rbd-network-solver';
const VERSION = '0.1.0';

type ProbOf = (componentId: string) => number;

/** Adjacency list for the directed network. */
function adjacency(net: RbdNetwork): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const c of net.connections) {
    if (!adj.has(c.from)) adj.set(c.from, []);
    adj.get(c.from)!.push(c.to);
  }
  return adj;
}

/** Remove duplicate and non-minimal (superset) path sets. */
function minimize(sets: string[][]): string[][] {
  const dedup = new Map<string, string[]>();
  for (const s of sets) {
    const a = [...new Set(s)].sort();
    dedup.set(a.join(' '), a);
  }
  const list = [...dedup.values()];
  const isSubset = (b: string[], a: string[]) => b.every((x) => a.includes(x));
  return list
    .filter((a) => !list.some((b) => b !== a && b.length < a.length && isSubset(b, a)))
    .sort((x, y) => x.length - y.length);
}

/** Enumerate minimal source→sink path sets (the component ids on each simple path). */
export function minimalPathSets(net: RbdNetwork, isComponent: (id: string) => boolean): string[][] {
  const adj = adjacency(net);
  const paths: string[][] = [];
  const visit = (node: string, visited: Set<string>, comps: string[]) => {
    if (node === net.sink) {
      paths.push([...comps]);
      return;
    }
    for (const next of adj.get(node) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      const isComp = isComponent(next);
      if (isComp) comps.push(next);
      visit(next, visited, comps);
      if (isComp) comps.pop();
      visited.delete(next);
    }
  };
  visit(net.source, new Set([net.source]), []);
  return minimize(paths);
}

/** True if source reaches sink using only `up` components (terminals always pass). */
function connected(
  net: RbdNetwork,
  adj: Map<string, string[]>,
  isComponent: (id: string) => boolean,
  up: Set<string>,
): boolean {
  const seen = new Set([net.source]);
  const queue = [net.source];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === net.sink) return true;
    for (const m of adj.get(n) ?? []) {
      if (seen.has(m)) continue;
      if (isComponent(m) && !up.has(m)) continue; // failed component blocks the path
      seen.add(m);
      queue.push(m);
    }
  }
  return seen.has(net.sink);
}

export function analyzeNetwork(req: AnalyzeRequest, net: RbdNetwork): AnalyzeResponse {
  const start = Date.now();
  const ir: ModelIR = req.modelIR;
  const warnings: Warning[] = [];
  const components = new Map(ir.components.map((c) => [c.id, c]));
  const isComponent = (id: string) => components.has(id);
  const mt = resolveValue(
    req.options.missionTime ?? ir.missionTime,
    ir.parameters,
    warnings,
    'mission time',
    0,
  );

  const pathSets = minimalPathSets(net, isComponent);
  if (pathSets.length === 0) {
    warnings.push({
      code: 'disconnected',
      message: 'No source→sink path; system reliability is 0.',
    });
  }

  const reliabilityOf: ProbOf = (id) => {
    const c = components.get(id);
    if (!c) return 1; // terminal / unknown — perfect
    const lambda = resolveValue(c.failureRate, ir.parameters, warnings, `failure rate of ${id}`);
    return Math.exp(-lambda * mt);
  };
  const availabilityOf: ProbOf = (id) => {
    const c = components.get(id);
    if (!c) return 1;
    const lambda = resolveValue(c.failureRate, ir.parameters, warnings, `failure rate of ${id}`);
    if (c.repairRate === undefined) {
      warnings.push({
        code: 'no_repair',
        message: `Component ${id} has no repair rate; using reliability as proxy.`,
      });
      return Math.exp(-lambda * mt);
    }
    const mu = resolveValue(c.repairRate, ir.parameters, warnings, `repair rate of ${id}`);
    return lambda + mu === 0 ? 1 : mu / (lambda + mu);
  };

  const base = {
    solverName: NAME,
    solverVersion: VERSION,
    modelIR: ir,
    method: req.method,
    startTime: start,
    warnings,
  };
  const assumptions = [
    'Two-terminal network reliability via minimal path sets + inclusion–exclusion',
    'Independent components; exponential time-to-failure (R=e^{−λt})',
  ];

  if (req.method === 'reliability' || req.method === 'availability') {
    const probOf = req.method === 'availability' ? availabilityOf : reliabilityOf;
    const value = pathSets.length === 0 ? 0 : topProbability(pathSets, probOf);
    const key = req.method;
    const contributions: Record<string, number> = {};
    for (const c of ir.components) contributions[c.id] = probOf(c.id);
    return buildResponse({
      ...base,
      metrics: { [key]: value, mission_time: mt, path_set_count: pathSets.length },
      contributions: { [key]: contributions },
      numericMetadata: { method: 'minimal path sets + inclusion-exclusion' },
      trace: { assumptions, methodDetails: `${pathSets.length} minimal path sets.` },
    });
  }

  if (req.method === 'sensitivity') {
    const baseR = pathSets.length === 0 ? 0 : topProbability(pathSets, reliabilityOf);
    const eps = 1e-4;
    const sensitivity: Record<string, number> = {};
    for (const c of ir.components) {
      const r = reliabilityOf(c.id);
      const perturbed: ProbOf = (id) =>
        id === c.id ? Math.min(1, r * (1 + eps)) : reliabilityOf(id);
      const rPert = pathSets.length === 0 ? 0 : topProbability(pathSets, perturbed);
      sensitivity[c.id] = baseR !== 0 ? (rPert - baseR) / baseR / eps : 0;
    }
    return buildResponse({
      ...base,
      metrics: { reliability: baseR },
      contributions: { sensitivity },
      numericMetadata: { method: 'finite difference (relative)' },
      trace: {
        assumptions,
        methodDetails:
          'Normalized sensitivity of system reliability to each component reliability.',
      },
    });
  }

  if (req.method === 'monte_carlo_simulation') {
    const N = req.options.monteCarloSamples ?? 10000;
    const rng = mulberry32(req.options.seed ?? 12345);
    const adj = adjacency(net);
    const reliab = new Map(ir.components.map((c) => [c.id, reliabilityOf(c.id)]));
    let success = 0;
    for (let s = 0; s < N; s++) {
      const up = new Set<string>();
      for (const c of ir.components) if (rng() < (reliab.get(c.id) ?? 0)) up.add(c.id);
      if (connected(net, adj, isComponent, up)) success++;
    }
    const p = success / N;
    const se = Math.sqrt((p * (1 - p)) / N);
    return buildResponse({
      ...base,
      metrics: { reliability: p, samples: N },
      errorBounds: {
        reliability: { lower: Math.max(0, p - 1.96 * se), upper: Math.min(1, p + 1.96 * se) },
      },
      numericMetadata: { method: 'Monte Carlo (connectivity sampling)', iterations: N },
      trace: {
        assumptions,
        methodDetails: `${N} samples, seed ${req.options.seed ?? 12345}; 95% CI in errorBounds.`,
      },
    });
  }

  return errorResponse(
    ir,
    req.method,
    `RBD network solver does not support method '${req.method}'`,
    NAME,
    start,
  );
}

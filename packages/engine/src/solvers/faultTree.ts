import type { Event, Gate, ModelIR } from '../ir/schema.js';
import type {
  AnalysisMethod,
  AnalyzeRequest,
  AnalyzeResponse,
  Solver,
  Warning,
} from './interface.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';
import { mulberry32 } from './random.js';

const NAME = 'fault-tree-solver';
const VERSION = '0.1.0';
const EXACT_LIMIT = 18;

type ProbOf = (eventId: string) => number;

function combinations<T>(arr: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > arr.length) return [];
  const out: T[][] = [];
  const rec = (start: number, combo: T[]) => {
    if (combo.length === k) {
      out.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1, combo);
      combo.pop();
    }
  };
  rec(0, []);
  return out;
}

function findTop(ir: ModelIR): string | undefined {
  const top = ir.events.find((e) => e.type === 'top');
  if (top) return top.id;
  const usedAsInput = new Set(ir.gates.flatMap((g) => g.inputs));
  const candidate = ir.gates.find((g) => !usedAsInput.has(g.output));
  return candidate?.output;
}

function expandGate(gate: Gate, warnings: Warning[]): string[][] {
  switch (gate.type) {
    case 'AND':
      return [gate.inputs];
    case 'OR':
      return gate.inputs.map((i) => [i]);
    case 'K_OF_N':
      return combinations(gate.inputs, gate.k ?? gate.inputs.length);
    case 'XOR':
      warnings.push({ code: 'noncoherent', message: 'XOR treated as OR (non-coherent; approximate).' });
      return gate.inputs.map((i) => [i]);
    case 'NOT':
      warnings.push({ code: 'noncoherent', message: 'NOT is unsupported in cut-set analysis; input passed through.' });
      return [[gate.inputs[0]]];
    default:
      return [gate.inputs];
  }
}

/** Compute minimal cut sets via MOCUS (top-down expansion + minimization). */
export function minimalCutSets(ir: ModelIR, warnings: Warning[] = []): string[][] {
  const gateByOutput = new Map(ir.gates.map((g) => [g.output, g]));
  const topId = findTop(ir);
  if (!topId) {
    warnings.push({ code: 'no_top', message: 'No top event found.' });
    return [];
  }
  const isExpandable = (id: string) => gateByOutput.has(id);

  let cutSets: Set<string>[] = [new Set([topId])];
  const MAX = 200000;
  let guard = 0;
  for (;;) {
    let progressed = false;
    const next: Set<string>[] = [];
    for (const cs of cutSets) {
      const expandable = [...cs].find(isExpandable);
      if (!expandable) {
        next.push(cs);
        continue;
      }
      progressed = true;
      const gate = gateByOutput.get(expandable)!;
      const rest = new Set(cs);
      rest.delete(expandable);
      for (const product of expandGate(gate, warnings)) {
        const ns = new Set(rest);
        for (const x of product) ns.add(x);
        next.push(ns);
      }
    }
    cutSets = next;
    if (!progressed) break;
    if (++guard > MAX || cutSets.length > MAX) {
      warnings.push({ code: 'too_large', message: 'Cut-set expansion exceeded limit; result truncated.' });
      break;
    }
  }
  return minimize(cutSets);
}

function minimize(sets: Set<string>[]): string[][] {
  const dedup = new Map<string, string[]>();
  for (const s of sets) {
    const a = [...s].sort();
    dedup.set(a.join(' '), a);
  }
  const list = [...dedup.values()];
  const isSubset = (b: string[], a: string[]) => b.every((x) => a.includes(x));
  return list
    .filter((a) => !list.some((b) => b !== a && b.length < a.length && isSubset(b, a)))
    .sort((x, y) => x.length - y.length);
}

/** Top-event probability from cut sets: exact inclusion–exclusion, or min-cut bound. */
export function topProbability(cutSets: string[][], probOf: ProbOf): number {
  if (cutSets.length === 0) return 0;
  if (cutSets.length <= EXACT_LIMIT) {
    const m = cutSets.length;
    let total = 0;
    for (let mask = 1; mask < 1 << m; mask++) {
      const union = new Set<string>();
      let bits = 0;
      for (let i = 0; i < m; i++) {
        if (mask & (1 << i)) {
          bits++;
          for (const x of cutSets[i]) union.add(x);
        }
      }
      let p = 1;
      for (const x of union) p *= probOf(x);
      total += (bits % 2 === 1 ? 1 : -1) * p;
    }
    return total;
  }
  return 1 - cutSets.reduce((acc, cs) => acc * (1 - cs.reduce((p, x) => p * probOf(x), 1)), 1);
}

/** Beta-factor common-cause transform: split affected basic events into independent
 *  (1−β)p parts and a shared βp CCF event, returning a new IR. */
function applyCCF(ir: ModelIR, warnings: Warning[]): ModelIR {
  const ccf = ir.dependencies.filter((d) => d.kind === 'common_cause_failure');
  if (ccf.length === 0) {
    warnings.push({ code: 'no_ccf', message: 'Model has no common-cause-failure groups.' });
    return ir;
  }
  const events: Event[] = ir.events.map((e) => ({ ...e }));
  const gates: Gate[] = ir.gates.map((g) => ({ ...g, inputs: [...g.inputs] }));
  const eventById = new Map(events.map((e) => [e.id, e]));
  let uid = 0;

  for (const dep of ccf) {
    if (dep.kind !== 'common_cause_failure') continue;
    if (dep.model !== 'beta_factor') {
      warnings.push({ code: 'ccf_model', message: `CCF model '${dep.model}' not supported; only beta_factor.` });
      continue;
    }
    const beta = resolveValue(dep.beta, ir.parameters, warnings, `beta of ${dep.id}`);
    const affected = dep.affectedComponents.filter((id) => eventById.has(id));
    if (affected.length < 2) {
      warnings.push({ code: 'ccf_affected', message: `CCF ${dep.id} needs ≥2 affected basic events.` });
      continue;
    }
    const repP = resolveValue(eventById.get(affected[0])!.probability, ir.parameters, warnings, `probability of ${affected[0]}`);
    const ccfId = `ccf_${dep.id}`;
    events.push({ id: ccfId, name: `CCF ${dep.name}`, type: 'basic', probability: beta * repP });

    for (const aId of affected) {
      const ev = eventById.get(aId)!;
      const p = resolveValue(ev.probability, ir.parameters, warnings, `probability of ${aId}`);
      const indId = `${aId}_ind`;
      events.push({ id: indId, name: `${ev.name} (indep)`, type: 'basic', probability: (1 - beta) * p });
      // aId becomes a gate output: (independent OR shared-CCF).
      ev.type = 'intermediate';
      delete ev.probability;
      gates.push({ id: `gccf_${uid++}`, type: 'OR', inputs: [indId, ccfId], output: aId });
    }
  }
  return { ...ir, events, gates };
}

export class FaultTreeSolver implements Solver {
  readonly name = NAME;
  readonly version = VERSION;
  readonly supportedMethods: AnalysisMethod[] = [
    'minimal_cut_sets',
    'reliability',
    'importance_measures',
    'sensitivity',
    'monte_carlo_simulation',
    'common_cause_failure',
  ];

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const start = Date.now();
    let ir = req.modelIR;
    const warnings: Warning[] = [];

    if (ir.gates.length === 0 && ir.events.length === 0) {
      return errorResponse(ir, req.method, 'Fault tree model has no gates or events', NAME, start);
    }

    // CCF transforms the model before analysis.
    let methodDetailsPrefix = '';
    if (req.method === 'common_cause_failure') {
      ir = applyCCF(ir, warnings);
      methodDetailsPrefix = 'Beta-factor CCF transform applied. ';
    }

    const cutSets = minimalCutSets(ir, warnings);
    if (cutSets.length === 0) {
      return errorResponse(ir, req.method, 'Could not derive cut sets (no top event or empty tree)', NAME, start);
    }

    const eventById = new Map(ir.events.map((e) => [e.id, e]));
    const basics = [...new Set(cutSets.flat())];
    const baseProb = new Map<string, number>();
    for (const id of basics) {
      const ev = eventById.get(id);
      baseProb.set(id, ev ? resolveValue(ev.probability, ir.parameters, warnings, `probability of ${id}`) : 0);
    }
    const probOf: ProbOf = (id) => baseProb.get(id) ?? 0;
    const base = {
      solverName: NAME,
      solverVersion: VERSION,
      modelIR: req.modelIR,
      method: req.method,
      startTime: start,
      warnings,
    };

    if (req.method === 'minimal_cut_sets') {
      const order: Record<string, number> = {};
      for (const cs of cutSets) order[`order_${cs.length}`] = (order[`order_${cs.length}`] ?? 0) + 1;
      return buildResponse({
        ...base,
        metrics: { cut_set_count: cutSets.length },
        contributions: { cut_set_order: order },
        numericMetadata: { method: 'MOCUS' },
        trace: {
          assumptions: ['Coherent fault tree (AND/OR/K-of-N); independent basic events'],
          methodDetails: 'Minimal cut sets: ' + cutSets.map((c) => `{${c.join(',')}}`).join('; '),
        },
      });
    }

    const pTop = topProbability(cutSets, probOf);
    const exact = cutSets.length <= EXACT_LIMIT;

    if (req.method === 'reliability' || req.method === 'common_cause_failure') {
      const errorBounds: Record<string, { lower: number; upper: number }> = {};
      if (!exact) {
        const rare = cutSets.reduce((s, cs) => s + cs.reduce((p, x) => p * probOf(x), 1), 0);
        const maxCut = Math.max(...cutSets.map((cs) => cs.reduce((p, x) => p * probOf(x), 1)));
        errorBounds.probability = { lower: maxCut, upper: Math.min(1, rare) };
        warnings.push({ code: 'approximate', message: `>${EXACT_LIMIT} cut sets; using min-cut bound (see errorBounds).` });
      }
      return buildResponse({
        ...base,
        metrics: { probability: pTop, reliability: 1 - pTop },
        numericMetadata: { method: exact ? 'inclusion-exclusion (exact)' : 'min-cut upper bound' },
        errorBounds,
        trace: { assumptions: ['Independent basic events'], methodDetails: `${methodDetailsPrefix}Top-event probability from ${cutSets.length} cut sets.` },
      });
    }

    const withProb = (id: string, value: number): ProbOf => (x) => (x === id ? value : probOf(x));

    if (req.method === 'importance_measures' || req.method === 'sensitivity') {
      const birnbaum: Record<string, number> = {};
      const fussellVesely: Record<string, number> = {};
      const raw: Record<string, number> = {};
      const rrw: Record<string, number> = {};
      const sensitivity: Record<string, number> = {};
      for (const e of basics) {
        const p1 = topProbability(cutSets, withProb(e, 1));
        const p0 = topProbability(cutSets, withProb(e, 0));
        birnbaum[e] = p1 - p0;
        raw[e] = pTop > 0 ? p1 / pTop : 0;
        rrw[e] = p0 > 0 ? pTop / p0 : Infinity;
        const containing = cutSets.filter((cs) => cs.includes(e));
        fussellVesely[e] = pTop > 0 ? topProbability(containing, probOf) / pTop : 0;
        // Normalized sensitivity = Birnbaum · p/P.
        sensitivity[e] = pTop > 0 ? (birnbaum[e] * probOf(e)) / pTop : 0;
      }
      if (req.method === 'sensitivity') {
        return buildResponse({
          ...base,
          metrics: { probability: pTop },
          contributions: { sensitivity },
          numericMetadata: { method: 'normalized Birnbaum (exact)' },
          trace: { assumptions: ['Independent basic events'], methodDetails: 'Normalized sensitivity ∂P/∂pᵢ · pᵢ/P per basic event.' },
        });
      }
      return buildResponse({
        ...base,
        metrics: { probability: pTop },
        contributions: { birnbaum, fussell_vesely: fussellVesely, raw, rrw },
        numericMetadata: { method: exact ? 'inclusion-exclusion (exact)' : 'min-cut bound' },
        trace: { assumptions: ['Independent basic events'], methodDetails: 'Birnbaum, Fussell-Vesely, RAW, RRW per basic event.' },
      });
    }

    if (req.method === 'monte_carlo_simulation') {
      const N = req.options.monteCarloSamples ?? 10000;
      const rng = mulberry32(req.options.seed ?? 12345);
      let fails = 0;
      for (let s = 0; s < N; s++) {
        const failed = new Set<string>();
        for (const e of basics) if (rng() < probOf(e)) failed.add(e);
        if (cutSets.some((cs) => cs.every((x) => failed.has(x)))) fails++;
      }
      const p = fails / N;
      const se = Math.sqrt((p * (1 - p)) / N);
      return buildResponse({
        ...base,
        metrics: { probability: p, reliability: 1 - p, samples: N },
        errorBounds: { probability: { lower: Math.max(0, p - 1.96 * se), upper: Math.min(1, p + 1.96 * se) } },
        numericMetadata: { method: 'Monte Carlo (Bernoulli sampling)', iterations: N },
        trace: { assumptions: ['Independent basic events'], methodDetails: `${N} samples, seed ${req.options.seed ?? 12345}; 95% CI in errorBounds.` },
      });
    }

    return errorResponse(ir, req.method, `Fault tree solver does not support method '${req.method}'`, NAME, start);
  }
}

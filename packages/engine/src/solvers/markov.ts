import type { ModelIR, State } from '../ir/schema.js';
import type {
  AnalysisMethod,
  AnalyzeRequest,
  AnalyzeResponse,
  Solver,
  Warning,
} from './interface.js';
import { identity, matExp, matvec, solveLinear, type Matrix } from './linalg.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';

const NAME = 'markov-solver';
const VERSION = '0.1.0';
const UP: State['type'][] = ['operational', 'degraded'];

function indexOf(ir: ModelIR): Map<string, number> {
  return new Map(ir.states.map((s, i) => [s.id, i]));
}

function transitionRates(ir: ModelIR, warnings: Warning[]): number[] {
  return ir.transitions.map((t) => resolveValue(t.rate, ir.parameters, warnings, `rate of ${t.id}`));
}

/** Build the CTMC generator matrix Q from transitions using the given rates. */
function buildQ(ir: ModelIR, rates: number[], index: Map<string, number>, warnings: Warning[]): Matrix {
  const n = ir.states.length;
  const Q: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  ir.transitions.forEach((t, k) => {
    const i = index.get(t.from);
    const j = index.get(t.to);
    if (i === undefined || j === undefined) {
      warnings.push({ code: 'dangling_transition', message: `Transition ${t.id} references unknown state` });
      return;
    }
    Q[i][j] += rates[k];
    Q[i][i] -= rates[k];
  });
  return Q;
}

function initialDist(ir: ModelIR, index: Map<string, number>): number[] {
  const n = ir.states.length;
  const p = new Array(n).fill(0);
  const ic = ir.initialCondition;
  if (ic?.type === 'single' && index.has(ic.stateId)) {
    p[index.get(ic.stateId)!] = 1;
  } else if (ic?.type === 'distribution') {
    for (const [id, prob] of Object.entries(ic.probabilities)) {
      if (index.has(id)) p[index.get(id)!] = prob;
    }
  } else if (n > 0) {
    p[0] = 1;
  }
  return p;
}

function steadyState(Q: Matrix): number[] {
  const n = Q.length;
  if (n === 1) return [1];
  const A: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Q[j][i]));
  for (let j = 0; j < n; j++) A[n - 1][j] = 1;
  const b = new Array(n).fill(0);
  b[n - 1] = 1;
  return solveLinear(A, b);
}

function isUp(ir: ModelIR, i: number): boolean {
  return UP.includes(ir.states[i].type);
}

/** Steady-state availability and failure frequency (up→down transition flow). */
function steadyMetrics(ir: ModelIR, Q: Matrix): { pi: number[]; availability: number; frequency: number } {
  const pi = steadyState(Q);
  const n = Q.length;
  let availability = 0;
  for (let i = 0; i < n; i++) if (isUp(ir, i)) availability += pi[i];
  let frequency = 0;
  for (let i = 0; i < n; i++) {
    if (!isUp(ir, i)) continue;
    for (let j = 0; j < n; j++) if (i !== j && !isUp(ir, j)) frequency += pi[i] * Q[i][j];
  }
  return { pi, availability, frequency };
}

function missionTimeOf(req: AnalyzeRequest, warnings: Warning[]): number {
  const ref = req.options.missionTime ?? req.modelIR.missionTime;
  return resolveValue(ref, req.modelIR.parameters, warnings, 'mission time', 0);
}

function transpose(a: Matrix): Matrix {
  const n = a.length;
  const m = a[0]?.length ?? 0;
  const out: Matrix = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = a[i][j];
  return out;
}

/** Reliability (1 − absorbed probability) at time t, used as the sensitivity target when absorbing. */
function reliabilityAt(ir: ModelIR, Q: Matrix, index: Map<string, number>, t: number): number {
  const absorbing = ir.states.filter((s) => s.type === 'absorbing');
  if (absorbing.length === 0) return 1;
  const P = t === 0 ? identity(Q.length) : matExp(Q, t);
  const pt = matvec(transpose(P), initialDist(ir, index));
  return 1 - absorbing.reduce((s, st) => s + pt[index.get(st.id)!], 0);
}

export class MarkovSolver implements Solver {
  readonly name = NAME;
  readonly version = VERSION;
  readonly supportedMethods: AnalysisMethod[] = [
    'steady_state',
    'availability',
    'transient',
    'mttf',
    'reliability',
    'frequency',
    'mtbf',
    'mttr',
    'expected_number_of_failures',
    'sensitivity',
  ];

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const start = Date.now();
    const ir = req.modelIR;
    const warnings: Warning[] = [];

    if (ir.states.length === 0) {
      return errorResponse(ir, req.method, 'Markov model has no states', NAME, start);
    }

    const index = indexOf(ir);
    const rates = transitionRates(ir, warnings);
    const Q = buildQ(ir, rates, index, warnings);
    const assumptions = [
      'Continuous-time Markov chain; transitions interpreted as constant rates',
      `Rates interpreted in ${ir.unitConfig.rateBase}`,
    ];
    const base = {
      solverName: NAME,
      solverVersion: VERSION,
      modelIR: ir,
      method: req.method,
      startTime: start,
      warnings,
    };
    const hasAbsorbing = ir.states.some((s) => s.type === 'absorbing');

    switch (req.method) {
      case 'steady_state':
      case 'availability': {
        const { pi, availability } = steadyMetrics(ir, Q);
        const contributions: Record<string, Record<string, number>> = { steady_state: {} };
        ir.states.forEach((s, i) => (contributions.steady_state[s.id] = pi[i]));
        if (hasAbsorbing) {
          warnings.push({
            code: 'absorbing_present',
            message: 'Model has absorbing states; steady-state availability tends to 0. Consider reliability/MTTF.',
          });
        }
        return buildResponse({
          ...base,
          metrics: { availability, steady_state: pi },
          contributions,
          numericMetadata: { method: 'linear-system (Gaussian elimination)' },
          trace: { assumptions, methodDetails: 'Solved πQ=0 with Σπ=1.' },
        });
      }

      case 'frequency':
      case 'mtbf':
      case 'mttr':
      case 'expected_number_of_failures': {
        if (hasAbsorbing) {
          warnings.push({ code: 'absorbing_present', message: 'Steady-state frequency metrics assume a repairable (no absorbing) model.' });
        }
        const { availability, frequency } = steadyMetrics(ir, Q);
        const metrics: Record<string, number> = { frequency, availability };
        if (frequency > 0) {
          metrics.mtbf = 1 / frequency; // mean time between failures (full cycle)
          metrics.mttr = (1 - availability) / frequency; // mean down time
          metrics.expected_number_of_failures = frequency * missionTimeOf(req, warnings);
        } else {
          warnings.push({ code: 'no_failures', message: 'Failure frequency is zero; MTBF/MTTR undefined.' });
        }
        return buildResponse({
          ...base,
          metrics,
          numericMetadata: { method: 'steady-state frequency balance' },
          trace: {
            assumptions: [...assumptions, 'Renewal relations: MTBF=1/ν, MTTR=(1−A)/ν, ENF=ν·T'],
            methodDetails: 'ν = Σ_{up i}Σ_{down j} π_i·Q[i][j].',
          },
        });
      }

      case 'transient': {
        const mt = missionTimeOf(req, warnings);
        const times = req.options.timePoints?.length ? req.options.timePoints : [mt];
        const p0 = initialDist(ir, index);
        const availability: number[] = [];
        for (const t of times) {
          const P = t === 0 ? identity(Q.length) : matExp(Q, t);
          const pt = matvec(transpose(P), p0);
          availability.push(ir.states.reduce((s, _st, i) => (isUp(ir, i) ? s + pt[i] : s), 0));
        }
        return buildResponse({
          ...base,
          metrics: { time: times, availability },
          numericMetadata: { method: 'uniformization (matrix exponential)' },
          trace: { assumptions, methodDetails: 'p(t) = p₀·exp(Qt) via uniformization.' },
        });
      }

      case 'mttf': {
        const transient = ir.states.filter((s) => s.type !== 'absorbing');
        if (transient.length === ir.states.length) {
          warnings.push({ code: 'no_absorbing', message: 'No absorbing state; MTTF is undefined.' });
          return errorResponse(ir, req.method, 'MTTF requires at least one absorbing state', NAME, start);
        }
        const m = transient.length;
        const QT: Matrix = Array.from({ length: m }, () => new Array(m).fill(0));
        transient.forEach((si, i) =>
          transient.forEach((sj, j) => (QT[i][j] = Q[index.get(si.id)!][index.get(sj.id)!])),
        );
        const neg = QT.map((row) => row.map((v) => -v));
        const tau = solveLinear(neg, new Array(m).fill(1));
        const p0 = initialDist(ir, index);
        let mttf = 0;
        transient.forEach((s, i) => (mttf += (p0[index.get(s.id)!] ?? 0) * tau[i]));
        return buildResponse({
          ...base,
          metrics: { mttf },
          numericMetadata: { method: 'fundamental matrix' },
          trace: { assumptions, methodDetails: 'Solved (−Q_T)·τ = 1 over transient states.' },
        });
      }

      case 'reliability': {
        const mt = missionTimeOf(req, warnings);
        if (!hasAbsorbing) {
          warnings.push({ code: 'no_absorbing', message: 'No absorbing (failure) state; reliability is 1.' });
          return buildResponse({ ...base, metrics: { reliability: 1 }, trace: { assumptions } });
        }
        return buildResponse({
          ...base,
          metrics: { reliability: reliabilityAt(ir, Q, index, mt), mission_time: mt },
          numericMetadata: { method: 'uniformization (matrix exponential)' },
          trace: { assumptions, methodDetails: 'R(t) = 1 − P(absorbed by t).' },
        });
      }

      case 'sensitivity': {
        const mt = missionTimeOf(req, warnings);
        // Target metric: availability for repairable, reliability for absorbing.
        const metricOf = (q: Matrix): number =>
          hasAbsorbing ? reliabilityAt(ir, q, index, mt) : steadyMetrics(ir, q).availability;
        const baseM = metricOf(Q);
        const eps = 1e-4;
        const sensitivity: Record<string, number> = {};
        ir.transitions.forEach((t, k) => {
          if (rates[k] === 0) {
            sensitivity[t.id] = 0;
            return;
          }
          const perturbed = rates.slice();
          perturbed[k] = rates[k] * (1 + eps);
          const mPerturbed = metricOf(buildQ(ir, perturbed, index, []));
          // Normalized sensitivity: (ΔM/M)/(Δrate/rate).
          sensitivity[t.id] = baseM !== 0 ? ((mPerturbed - baseM) / baseM) / eps : 0;
        });
        return buildResponse({
          ...base,
          metrics: { [hasAbsorbing ? 'reliability' : 'availability']: baseM },
          contributions: { sensitivity },
          numericMetadata: { method: 'finite difference (relative)' },
          trace: {
            assumptions,
            methodDetails: `Normalized sensitivity of ${hasAbsorbing ? 'reliability' : 'availability'} to each transition rate.`,
          },
        });
      }

      default:
        return errorResponse(ir, req.method, `Markov solver does not support method '${req.method}'`, NAME, start);
    }
  }
}

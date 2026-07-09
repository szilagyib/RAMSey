import type {
  AnalysisMethod,
  AnalyzeRequest,
  AnalyzeResponse,
  Solver,
  Warning,
} from './interface.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';

const NAME = 'bow-tie-solver';
const VERSION = '0.1.0';

export class BowTieSolver implements Solver {
  readonly name = NAME;
  readonly version = VERSION;
  readonly supportedMethods: AnalysisMethod[] = ['frequency'];

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const start = Date.now();
    const ir = req.modelIR;
    const warnings: Warning[] = [];

    const bt = ir.bowTie;
    if (!bt || bt.nodes.length === 0) {
      return errorResponse(ir, req.method, 'Bow-tie model has no structure', NAME, start);
    }
    if (req.method !== 'frequency') {
      return errorResponse(ir, req.method, `Bow-tie solver does not support method '${req.method}'`, NAME, start);
    }

    const byId = new Map(bt.nodes.map((n) => [n.id, n]));
    const label = (id: string) => bt.labels?.[id] ?? id;
    const out = new Map<string, string[]>();
    const inc = new Map<string, string[]>();
    for (const e of bt.edges) {
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from)!.push(e.to);
      if (!inc.has(e.to)) inc.set(e.to, []);
      inc.get(e.to)!.push(e.from);
    }

    // Leak factor across a node on a propagation path: barriers reduce by their
    // effectiveness (failure prob = 1 − effectiveness); other nodes pass through.
    const leakFactor = (id: string): number => {
      const n = byId.get(id);
      if (n && (n.kind === 'preventive_barrier' || n.kind === 'mitigative_barrier')) {
        const eff = resolveValue(n.effectiveness, ir.parameters, warnings, `effectiveness of ${label(id)}`, 0);
        return 1 - eff;
      }
      return 1;
    };

    // ── Left side: top-event probability from threats through preventive barriers ──
    const threats = bt.nodes.filter((n) => n.kind === 'threat');
    const leakToTop = (threatId: string): number => {
      // Product of leak factors along the threat → top path (DFS, first path).
      let best = 0;
      const visit = (node: string, acc: number, seen: Set<string>) => {
        if (node === bt.topEventId) {
          best = Math.max(best, acc);
          return;
        }
        for (const next of out.get(node) ?? []) {
          if (seen.has(next)) continue;
          visit(next, acc * leakFactor(next), new Set(seen).add(next));
        }
      };
      const pThreat = resolveValue(byId.get(threatId)?.probability, ir.parameters, warnings, `probability of ${label(threatId)}`, 1);
      visit(threatId, pThreat, new Set([threatId]));
      return best;
    };
    const threatContrib: Record<string, number> = {};
    let pTopComplement = 1;
    for (const t of threats) {
      const leak = leakToTop(t.id);
      threatContrib[label(t.id)] = leak;
      pTopComplement *= 1 - leak;
    }
    const pTop = threats.length === 0 ? 0 : 1 - pTopComplement;
    if (threats.length === 0) {
      warnings.push({ code: 'no_threats', message: 'No threats found; top-event probability is 0.' });
    }
    if (threats.some((t) => (t.probability ?? undefined) === undefined)) {
      warnings.push({ code: 'threat_prob_default', message: 'Threat probabilities default to 1 (no canvas field); results are barrier-driven.' });
    }

    // ── Right side: consequence probabilities through mitigative barriers ──
    const consequences = bt.nodes.filter((n) => n.kind === 'consequence');
    const consequenceContrib: Record<string, number> = {};
    for (const c of consequences) {
      // Sum over top → consequence paths of P(top) × ∏ leak factors on the path.
      let total = 0;
      const visit = (node: string, acc: number, seen: Set<string>) => {
        if (node === c.id) {
          total += acc;
          return;
        }
        for (const next of out.get(node) ?? []) {
          if (seen.has(next)) continue;
          visit(next, acc * leakFactor(next), new Set(seen).add(next));
        }
      };
      visit(bt.topEventId, pTop, new Set([bt.topEventId]));
      consequenceContrib[label(c.id)] = total;
    }

    return buildResponse({
      solverName: NAME,
      solverVersion: VERSION,
      modelIR: ir,
      method: req.method,
      startTime: start,
      warnings,
      metrics: { top_event_probability: pTop, consequence_count: consequences.length },
      contributions: { threat: threatContrib, consequence: consequenceContrib },
      numericMetadata: { method: 'bow-tie barrier propagation' },
      trace: {
        assumptions: [
          'Top event occurs if any threat passes its preventive barriers (barrier failure prob = 1 − effectiveness)',
          'Threat probabilities default to 1; barriers drive the reduction',
          'Each consequence is reached when the mitigative barriers on its path fail (escalation cascade)',
          'Threats treated as independent',
        ],
        methodDetails: 'P(top) = 1 − ∏(1 − leak); consequence = P(top) × ∏(1 − effectiveness) along the path.',
      },
    });
  }
}

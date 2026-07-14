import type { EventTreeStructure, ModelIR } from '../ir/schema.js';
import type {
  AnalysisMethod,
  AnalyzeRequest,
  AnalyzeResponse,
  Solver,
  Warning,
} from './interface.js';
import { resolveValue } from './valueref.js';
import { buildResponse, errorResponse } from './response.js';

const NAME = 'event-tree-solver';
const VERSION = '0.1.0';

/** Compute consequence frequencies/probabilities by walking the branches. */
function computeConsequences(
  et: EventTreeStructure,
  parameters: ModelIR['parameters'],
  warnings: Warning[],
): Record<string, number> {
  const adj = new Map<string, { to: string; p: number }[]>();
  for (const b of et.branches) {
    const p = resolveValue(b.probability, parameters, warnings, `branch ${b.from}→${b.to}`, 1);
    if (!adj.has(b.from)) adj.set(b.from, []);
    adj.get(b.from)!.push({ to: b.to, p });
  }

  // Warn when a pivotal event's outgoing branch probabilities don't sum to ~1.
  for (const [from, outs] of adj) {
    const sum = outs.reduce((s, o) => s + o.p, 0);
    if (Math.abs(sum - 1) > 0.01) {
      warnings.push({
        code: 'branch_sum',
        message: `Outgoing branch probabilities at '${et.labels?.[from] ?? from}' sum to ${sum.toFixed(3)}, not 1.`,
      });
    }
  }

  const start = resolveValue(
    et.initiatingProbability,
    parameters,
    warnings,
    'initiating probability',
    1,
  );
  const consequences: Record<string, number> = {};
  const label = (id: string) => et.labels?.[id] ?? id;

  const visit = (node: string, acc: number, seen: Set<string>) => {
    const outs = adj.get(node);
    if (!outs || outs.length === 0) {
      // Leaf = consequence.
      consequences[label(node)] = (consequences[label(node)] ?? 0) + acc;
      return;
    }
    for (const { to, p } of outs) {
      if (seen.has(to)) {
        warnings.push({ code: 'cycle', message: `Cycle at '${label(to)}'; path truncated.` });
        continue;
      }
      visit(to, acc * p, new Set(seen).add(to));
    }
  };
  visit(et.initiatingId, start, new Set([et.initiatingId]));
  return consequences;
}

export class EventTreeSolver implements Solver {
  readonly name = NAME;
  readonly version = VERSION;
  readonly supportedMethods: AnalysisMethod[] = ['frequency'];

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    const start = Date.now();
    const ir = req.modelIR;
    const warnings: Warning[] = [];

    if (!ir.eventTree || ir.eventTree.branches.length === 0) {
      return errorResponse(ir, req.method, 'Event-tree model has no branches', NAME, start);
    }
    if (req.method !== 'frequency') {
      return errorResponse(
        ir,
        req.method,
        `Event-tree solver does not support method '${req.method}'`,
        NAME,
        start,
      );
    }

    const consequences = computeConsequences(ir.eventTree, ir.parameters, warnings);
    const total = Object.values(consequences).reduce((s, v) => s + v, 0);

    return buildResponse({
      solverName: NAME,
      solverVersion: VERSION,
      modelIR: ir,
      method: req.method,
      startTime: start,
      warnings,
      metrics: { total, consequence_count: Object.keys(consequences).length },
      contributions: { consequence: consequences },
      numericMetadata: { method: 'path-probability enumeration' },
      trace: {
        assumptions: [
          'Each branch carries its conditional probability; branches at a node are mutually exclusive',
          'Consequence value = initiating value × product of branch probabilities along the path',
        ],
        methodDetails: 'Depth-first traversal from the initiating event to each consequence.',
      },
    });
  }
}

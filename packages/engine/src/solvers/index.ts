import type { DiagramType } from '../ir/schema.js';
import type { AnalyzeRequest, AnalyzeResponse, Solver } from './interface.js';
import { MarkovSolver } from './markov.js';
import { RbdSolver } from './rbd.js';
import { FaultTreeSolver } from './faultTree.js';
import { EventTreeSolver } from './eventTree.js';
import { BowTieSolver } from './bowTie.js';
import { errorResponse } from './response.js';

export * from './interface.js';
export { MarkovSolver } from './markov.js';
export { RbdSolver } from './rbd.js';
export { FaultTreeSolver, minimalCutSets, topProbability } from './faultTree.js';
export { analyzeNetwork, minimalPathSets } from './rbdNetwork.js';
export { EventTreeSolver } from './eventTree.js';
export { BowTieSolver } from './bowTie.js';
export { buildResponse, errorResponse, contentHash } from './response.js';
export { resolveValue } from './valueref.js';
export * as linalg from './linalg.js';

const markov = new MarkovSolver();
const rbd = new RbdSolver();
const faultTree = new FaultTreeSolver();
const eventTree = new EventTreeSolver();
const bowTie = new BowTieSolver();

/** Return the solver responsible for a given diagram type, if any. */
export function getSolver(type: DiagramType): Solver | undefined {
  switch (type) {
    case 'markov_chain':
      return markov;
    case 'reliability_block_diagram':
      return rbd;
    case 'fault_tree':
      return faultTree;
    case 'event_tree':
      return eventTree;
    case 'bow_tie':
      return bowTie;
    default:
      return undefined;
  }
}

/**
 * Dispatch an analysis request to the appropriate solver. Returns a clean error
 * response for unsupported diagram types or methods rather than throwing.
 */
export async function analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const { modelIR, method } = request;
  const solver = getSolver(modelIR.type);
  if (!solver) {
    return errorResponse(
      modelIR,
      method,
      `No solver available for diagram type '${modelIR.type}'`,
      'dispatcher',
      Date.now(),
    );
  }
  if (!solver.supportedMethods.includes(method)) {
    return errorResponse(
      modelIR,
      method,
      `Method '${method}' is not supported for ${modelIR.type}`,
      solver.name,
      Date.now(),
    );
  }
  return solver.analyze(request);
}

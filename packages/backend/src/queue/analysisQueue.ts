import type { AnalysisMethod, AnalysisOptions, ModelIR } from '@ramsey/engine';
import { parseBooleanEnv } from '../config/featureFlags.js';

// ---------------------------------------------------------------------------
// Analysis queue abstraction. Routes depend on this interface; the pg-boss
// implementation is injected at startup, and tests inject a fake.
// ---------------------------------------------------------------------------

export const ANALYSIS_QUEUE = 'analysis';

export interface AnalysisJobPayload {
  /** Id of the domain AnalysisJob row this queue job corresponds to. */
  jobId: string;
  diagramId: string;
  modelIR: ModelIR;
  method: AnalysisMethod;
  options: AnalysisOptions;
}

export interface AnalysisQueue {
  enqueue(payload: AnalysisJobPayload): Promise<void>;
}

let queue: AnalysisQueue | null = null;

export function setAnalysisQueue(q: AnalysisQueue | null): void {
  queue = q;
}

export function getAnalysisQueue(): AnalysisQueue | null {
  return queue;
}

/**
 * Whether a job submitted now would actually be computed.
 *
 * A queue exists whenever pg-boss can reach Postgres, which says nothing about
 * anyone consuming it: with no solver-worker deployed, jobs sit QUEUED until the
 * client gives up. So availability also requires the operator to declare that a
 * worker is running (`SOLVER_WORKER_ENABLED`), and defaults to off — a deployment
 * without the worker must not advertise server-side analysis.
 */
export function isServerAnalysisAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnv(env.SOLVER_WORKER_ENABLED, false) && queue !== null;
}

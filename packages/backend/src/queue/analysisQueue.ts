import type { AnalysisMethod, AnalysisOptions, ModelIR } from '@ramsey/engine';

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

import type { AnalyzeRequest, AnalyzeResponse } from '@ramsey/engine';

// ---------------------------------------------------------------------------
// Runs analysis in a Web Worker (off the main thread), falling back to inline
// execution when workers are unavailable (e.g. test/SSR environments).
// ---------------------------------------------------------------------------

interface Pending {
  resolve: (r: AnalyzeResponse) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken || typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('../workers/analysisWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, response, error } = e.data as {
        id: number;
        response?: AnalyzeResponse;
        error?: string;
      };
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else if (response) p.resolve(response);
    };
    worker.onerror = () => {
      // The worker failed — reject everything in flight and disable it so
      // subsequent calls use the inline fallback.
      for (const p of pending.values()) p.reject(new Error('Analysis worker error'));
      pending.clear();
      worker?.terminate();
      worker = null;
      workerBroken = true;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Run an analysis request, off the main thread when possible. */
export async function runAnalysis(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const w = getWorker();
  if (!w) {
    const { analyze } = await import('@ramsey/engine');
    return analyze(request);
  }
  const id = nextId++;
  return new Promise<AnalyzeResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, request });
  });
}

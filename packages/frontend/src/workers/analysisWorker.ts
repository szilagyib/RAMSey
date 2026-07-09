import { analyze, type AnalyzeRequest } from '@ramsey/engine';

// Web Worker entry point: runs the analysis engine off the main thread so large
// solves don't freeze the UI. Messages are { id, request }; replies are
// { id, response } or { id, error }.

interface WorkerScope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (e: MessageEvent) => {
  const { id, request } = e.data as { id: number; request: AnalyzeRequest };
  try {
    const response = await analyze(request);
    ctx.postMessage({ id, response });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

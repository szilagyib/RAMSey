import type { AnalysisMethod, AnalyzeResponse } from '@ramsey/engine';

// ---------------------------------------------------------------------------
// Persistent (localStorage) cache of analysis results, keyed by
// diagram + method + content hash. Lets the panel skip recompute on an
// unchanged model and restore the last result after a reload.
// ---------------------------------------------------------------------------

const STORE_KEY = 'ramsey.analysisCache.v1';
const MAX_ENTRIES = 50;

export interface CacheEntry {
  key: string;
  diagramId: string;
  method: AnalysisMethod;
  response: AnalyzeResponse;
  at: number;
}

function load(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as CacheEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable — caching is best-effort
  }
}

function makeKey(diagramId: string, method: string, contentHash: string): string {
  return `${diagramId}:${method}:${contentHash}`;
}

/** A cached result for an exact (diagram, method, model-state), or null. */
export function getCachedResult(
  diagramId: string,
  method: AnalysisMethod,
  contentHash: string,
): AnalyzeResponse | null {
  const key = makeKey(diagramId, method, contentHash);
  return load().find((e) => e.key === key)?.response ?? null;
}

/** Store a result; evicts the oldest entries beyond MAX_ENTRIES. */
export function setCachedResult(
  diagramId: string,
  method: AnalysisMethod,
  contentHash: string,
  response: AnalyzeResponse,
  now: number = Date.now(),
): void {
  const key = makeKey(diagramId, method, contentHash);
  let entries = load().filter((e) => e.key !== key);
  entries.push({ key, diagramId, method, response, at: now });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
  }
  persist(entries);
}

/** The most recently stored result for a diagram (any method), or null. */
export function getLatestResult(diagramId: string): CacheEntry | null {
  const entries = load().filter((e) => e.diagramId === diagramId);
  if (entries.length === 0) return null;
  return entries.reduce((latest, e) => (e.at > latest.at ? e : latest));
}

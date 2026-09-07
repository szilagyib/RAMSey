import type { AnalysisMethod, AnalyzeResponse } from '@ramsey/engine';

// ---------------------------------------------------------------------------
// Persistent (localStorage) cache of analysis results, keyed by
// diagram + method + content hash. Lets the panel skip recompute on an
// unchanged model and restore the last result after a reload.
// ---------------------------------------------------------------------------

const STORE_KEY = 'ramsey.analysisCache.v2';
const MAX_ENTRIES = 50;

/**
 * Prefix shared by this store and every version of it that came before.
 *
 * Entries are keyed by the model's content hash, which says nothing about the
 * solver that produced the numbers — so a solver correctness fix cannot reach
 * anyone holding a cached result: the model is unchanged, the key still matches,
 * and the panel keeps serving the old numbers labelled "model unchanged". Bump
 * STORE_KEY when solver numerics change (v2: the Markov matrix exponential
 * returned zeros past Λ·t > 745); anything else under this prefix is a
 * superseded store and gets cleared.
 *
 * Matching on the prefix rather than naming the predecessor covers a browser
 * that skipped a version — naming only v1 would strand v0 entries forever,
 * which is the leak this exists to prevent.
 */
const STORE_KEY_PREFIX = 'ramsey.analysisCache';

export interface CacheEntry {
  key: string;
  diagramId: string;
  method: AnalysisMethod;
  response: AnalyzeResponse;
  at: number;
}

/**
 * Drop any superseded store.
 *
 * Reads the key list first and only writes when there is something to remove,
 * so this costs a scan of a handful of keys on every load and a write only the
 * once — rather than a removeItem on every cache read for the life of the
 * product.
 */
function clearSupersededStores(): void {
  const stale = Object.keys(localStorage).filter(
    (key) =>
      key !== STORE_KEY && (key === STORE_KEY_PREFIX || key.startsWith(`${STORE_KEY_PREFIX}.`)),
  );
  for (const key of stale) localStorage.removeItem(key);
}

function load(): CacheEntry[] {
  try {
    clearSupersededStores();
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

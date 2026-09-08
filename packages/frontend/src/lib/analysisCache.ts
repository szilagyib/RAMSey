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
 * and the panel keeps serving the old numbers labelled "model unchanged".
 *
 * That is now handled by the key, which carries the solver version, so no
 * future bump is needed. This prefix covers the one-time migration off v1,
 * whose entries have no version segment and are dead weight in browsers that
 * ran the old code. Matching the prefix rather than naming v1 also covers a
 * browser that skipped a version.
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
 * Drop any superseded store. Runs once when this module loads.
 *
 * Deliberately not called from `load()`: that would enumerate every key in the
 * origin on each cache read, and — worse — put the cleanup under load()'s
 * blanket catch, where a storage failure (Safari private mode, a disabled
 * storage setting, a quota error) reads as "the cache is unreadable". The next
 * write would then rebuild the entry list from empty and persist it, discarding
 * every good entry in order to fail at deleting one dead key. Failing to clean
 * up is a nuisance; losing the cache is not, so it catches for itself.
 */
export function clearSupersededStores(): void {
  try {
    const stale = Object.keys(localStorage).filter(
      (key) =>
        key !== STORE_KEY && (key === STORE_KEY_PREFIX || key.startsWith(`${STORE_KEY_PREFIX}.`)),
    );
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // Storage unavailable — the stale keys stay, which costs nothing but space.
  }
}

clearSupersededStores();

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

/**
 * A cache key has to name everything the result depends on. The model hash
 * fingerprints the model; the solver version fingerprints the code that turned
 * it into numbers. Leaving the latter out is what made a numerics fix unable to
 * reach anyone holding a cached result — the model was unchanged, so the entry
 * still matched and the old numbers kept being served as "model unchanged".
 */
function makeKey(
  diagramId: string,
  method: string,
  contentHash: string,
  solverVersion: string,
): string {
  return `${diagramId}:${method}:${contentHash}:${solverVersion}`;
}

/** A cached result for an exact (diagram, method, model-state), or null. */
export function getCachedResult(
  diagramId: string,
  method: AnalysisMethod,
  contentHash: string,
  solverVersion: string,
): AnalyzeResponse | null {
  const key = makeKey(diagramId, method, contentHash, solverVersion);
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
  // Taken from the response rather than asked for: the solver that answered is
  // the authority on which version produced these numbers.
  const key = makeKey(diagramId, method, contentHash, response.solver.version);
  let entries = load().filter((e) => e.key !== key);
  entries.push({ key, diagramId, method, response, at: now });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES);
  }
  persist(entries);
}

/**
 * The most recently stored result for a diagram (any method), or null.
 *
 * Filtered by solver version like the keyed lookup: restoring a panel with
 * numbers from a superseded solver would reintroduce exactly what keying them
 * out prevents.
 */
export function getLatestResult(diagramId: string, solverVersion: string): CacheEntry | null {
  const entries = load().filter(
    (e) => e.diagramId === diagramId && e.response.solver.version === solverVersion,
  );
  if (entries.length === 0) return null;
  return entries.reduce((latest, e) => (e.at > latest.at ? e : latest));
}

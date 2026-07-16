import { useEffect, useState } from 'react';
import { Play, ChevronDown, ChevronRight } from 'lucide-react';
import { contentHash, type AnalysisMethod, type AnalyzeResponse } from '@ramsey/engine';
import { useDiagramStore } from '../../stores/diagramStore';
import { runAnalysis } from '../../lib/analysisClient';
import { getCachedResult, setCachedResult, getLatestResult } from '../../lib/analysisCache';
import {
  markovToModelIR,
  faultTreeToModelIR,
  rbdToModelIR,
  eventTreeToModelIR,
  bowTieToModelIR,
} from '../../lib/toModelIR';
import { api } from '../../services/api';
import { useCapabilities } from '../../lib/capabilities';
import { Button } from '../ui/Button';

interface AnalysisPanelProps {
  projectId?: string;
  diagramId?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const METHODS_BY_TYPE: Record<string, ReadonlyArray<[AnalysisMethod, string]>> = {
  markov_chain: [
    ['availability', 'Availability (steady-state)'],
    ['steady_state', 'Steady-state probabilities'],
    ['transient', 'Transient availability'],
    ['reliability', 'Reliability at mission time'],
    ['mttf', 'MTTF'],
    ['mtbf', 'Frequency / MTBF / MTTR'],
    ['sensitivity', 'Sensitivity'],
  ],
  fault_tree: [
    ['reliability', 'Top-event probability'],
    ['minimal_cut_sets', 'Minimal cut sets'],
    ['importance_measures', 'Importance measures'],
    ['sensitivity', 'Sensitivity'],
    ['monte_carlo_simulation', 'Monte Carlo'],
  ],
  reliability_block_diagram: [
    ['reliability', 'Reliability'],
    ['availability', 'Availability'],
    ['sensitivity', 'Sensitivity'],
    ['monte_carlo_simulation', 'Monte Carlo'],
  ],
  event_tree: [['frequency', 'Consequence probabilities']],
  bow_tie: [['frequency', 'Top event & consequences']],
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n !== 0 && Math.abs(n) < 1e-3) return n.toExponential(3);
  return Number(n.toFixed(6)).toString();
}

function linspace(a: number, b: number, count: number): number[] {
  if (count <= 1) return [b];
  return Array.from({ length: count }, (_, i) => a + ((b - a) * i) / (count - 1));
}

export function AnalysisPanel({ projectId, diagramId }: AnalysisPanelProps) {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const diagramType = useDiagramStore((s) => s.diagramType);

  const methods = METHODS_BY_TYPE[diagramType];
  const [method, setMethod] = useState<AnalysisMethod>(methods?.[0]?.[0] ?? 'availability');
  const [missionTime, setMissionTime] = useState(8760);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [cached, setCached] = useState(false);
  const [guard, setGuard] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [serverRun, setServerRun] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  // Server runs need a persisted diagram AND a deployment with the analysis
  // queue enabled; otherwise the toggle is hidden and analysis stays client-side.
  const { serverAnalysis } = useCapabilities();
  const canRunOnServer = Boolean(projectId && diagramId) && serverAnalysis;

  // Restore the most recent stored result for this diagram.
  useEffect(() => {
    if (!result && diagramId) {
      const latest = getLatestResult(diagramId);
      if (latest) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the persisted result when the tab mounts
        setResult(latest.response);
        setMethod(latest.method);
        setCached(true);
      }
    }
  }, [diagramId, result]);

  const showMissionTime = diagramType !== 'fault_tree';

  function buildIR() {
    if (diagramType === 'markov_chain') return markovToModelIR(nodes, edges, missionTime);
    if (diagramType === 'fault_tree') return faultTreeToModelIR(nodes, edges);
    if (diagramType === 'reliability_block_diagram') return rbdToModelIR(nodes, edges, missionTime);
    if (diagramType === 'event_tree') return eventTreeToModelIR(nodes, edges);
    if (diagramType === 'bow_tie') return bowTieToModelIR(nodes, edges);
    return null;
  }

  /** Submit a server-side job and poll until it finishes. Returns null on failure/timeout. */
  async function runOnServer(
    modelIR: ReturnType<typeof buildIR>,
    options: Record<string, unknown>,
  ): Promise<AnalyzeResponse | null> {
    const { jobId } = (
      await api.analysis.create(projectId!, diagramId!, { modelIR, method, options })
    ).data;
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const job = (await api.analysis.get(projectId!, diagramId!, jobId)).data;
      if (job.status === 'COMPLETED' && job.result) return job.result as AnalyzeResponse;
      if (job.status === 'FAILED') {
        setGuard(job.errorMessage ?? 'Server analysis failed.');
        return null;
      }
    }
    setGuard('Server analysis timed out.');
    return null;
  }

  async function run() {
    setRunning(true);
    setGuard(null);
    setResult(null);
    setCached(false);
    try {
      const ir = buildIR();
      if (!ir) {
        setGuard(
          diagramType === 'reliability_block_diagram'
            ? 'This reliability block diagram needs both an input and an output terminal to analyze.'
            : diagramType === 'event_tree'
              ? 'This event tree needs an initiating event to analyze.'
              : diagramType === 'bow_tie'
                ? 'This bow-tie needs a central top event to analyze.'
                : 'Could not build an analyzable model from this diagram.',
        );
        return;
      }
      const hash = contentHash(ir);
      // Return a cached result if this exact model+method was already solved.
      if (diagramId) {
        const hit = getCachedResult(diagramId, method, hash);
        if (hit) {
          setResult(hit);
          setCached(true);
          return;
        }
      }
      const options = method === 'transient' ? { timePoints: linspace(0, missionTime, 11) } : {};

      const res =
        serverRun && canRunOnServer
          ? await runOnServer(ir, options) // null on failure/timeout (guard set)
          : await runAnalysis({ modelIR: ir, method, options, executionTarget: 'browser' });
      if (!res) return;
      setResult(res);
      if (diagramId && res.status === 'success') setCachedResult(diagramId, method, hash, res);
    } catch (err) {
      window.alert(`Analysis failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      {!methods ? (
        <div className="px-3 py-4 text-xs text-surface-500">
          Analysis is available for Markov chains, fault trees, reliability block diagrams, event
          trees, and bow-ties. This diagram type has no solver yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-3 py-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-surface-500">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as AnalysisMethod)}
              className="w-full rounded border border-surface-300 bg-white dark:bg-surface-200 px-2 py-1 text-xs"
            >
              {methods.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {showMissionTime && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-surface-500">
                Mission time
              </label>
              <input
                type="number"
                value={missionTime}
                min={0}
                onChange={(e) => setMissionTime(Number(e.target.value))}
                className="w-full rounded border border-surface-300 bg-white dark:bg-surface-200 px-2 py-1 text-xs"
              />
            </div>
          )}

          {canRunOnServer && (
            <label className="flex items-center gap-1.5 text-[11px] text-surface-600">
              <input
                type="checkbox"
                checked={serverRun}
                onChange={(e) => setServerRun(e.target.checked)}
                className="h-3 w-3"
              />
              Run on server (queued)
            </label>
          )}

          <Button size="sm" onClick={run} disabled={running || nodes.length === 0}>
            <Play className="mr-1 h-3.5 w-3.5" />
            {running ? (serverRun && canRunOnServer ? 'Queued…' : 'Running…') : 'Run analysis'}
          </Button>

          {guard && (
            <div className="rounded border border-state-degraded-200 bg-state-degraded-50 px-2 py-1.5 text-[11px] text-state-degraded-700">
              {guard}
            </div>
          )}
          {cached && result && (
            <span className="-mb-1 text-[10px] text-surface-400">
              Cached result (model unchanged)
            </span>
          )}
          {result && <Results result={result} />}
        </div>
      )}

      {result && methods && (
        <div className="border-t border-surface-100 dark:border-surface-300 px-3 py-2">
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="flex items-center gap-1 text-[11px] text-surface-500"
          >
            {showTrace ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Method &amp; assumptions
          </button>
          {showTrace && (
            <div className="mt-1 space-y-1 text-[11px] text-surface-500">
              <div>
                <span className="text-surface-400">method:</span> {result.numericMetadata.method}
              </div>
              {result.trace.assumptions.map((a, i) => (
                <div key={i}>• {a}</div>
              ))}
              {result.trace.methodDetails && (
                <div className="text-surface-400">{result.trace.methodDetails}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Results({ result }: { result: AnalyzeResponse }) {
  if (result.status === 'error') {
    return (
      <div className="rounded border border-state-failed-200 bg-state-failed-50 px-2 py-1.5 text-[11px] text-state-failed-700">
        {result.warnings[0]?.message ?? 'Analysis error.'}
      </div>
    );
  }

  const scalarMetrics = Object.entries(result.metrics).filter(([, v]) => typeof v === 'number') as [
    string,
    number,
  ][];
  const timeSeries =
    Array.isArray(result.metrics.time) && Array.isArray(result.metrics.availability)
      ? (result.metrics.time as number[]).map((t, i) => [
          t,
          (result.metrics.availability as number[])[i],
        ])
      : null;

  return (
    <div className="rounded border border-surface-100 dark:border-surface-300 p-2 text-[11px]">
      {scalarMetrics.length > 0 && (
        <table className="w-full">
          <tbody>
            {scalarMetrics.map(([k, v]) => (
              <tr key={k}>
                <td className="py-0.5 pr-2 text-surface-500">{k}</td>
                <td className="py-0.5 text-right font-mono text-surface-800">{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {timeSeries && (
        <div className="mt-2">
          <div className="mb-1 text-surface-400">availability over time</div>
          <table className="w-full font-mono">
            <tbody>
              {timeSeries.map(([t, a], i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2 text-surface-500">t={fmt(t)}</td>
                  <td className="py-0.5 text-right text-surface-800">{fmt(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Object.entries(result.contributions).map(([group, values]) => (
        <div key={group} className="mt-2">
          <div className="mb-1 text-surface-400">{group}</div>
          <table className="w-full font-mono">
            <tbody>
              {Object.entries(values).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pr-2 text-surface-500">{k}</td>
                  <td className="py-0.5 text-right text-surface-800">{fmt(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {result.warnings.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="text-state-degraded-600">
              ⚠ {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

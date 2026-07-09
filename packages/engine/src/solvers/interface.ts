import type { ModelIR, ValueRef } from '../ir/schema.js';

// ---------------------------------------------------------------------------
// Analysis method — the full set of supported solver methods
// ---------------------------------------------------------------------------

export type AnalysisMethod =
  | 'steady_state'
  | 'transient'
  | 'availability'
  | 'reliability'
  | 'mttf'
  | 'mtbf'
  | 'mttr'
  | 'frequency'
  | 'expected_number_of_failures'
  | 'importance_measures'
  | 'sensitivity'
  | 'minimal_cut_sets'
  | 'common_cause_failure'
  | 'uncertainty_propagation'
  | 'monte_carlo_simulation';

// ---------------------------------------------------------------------------
// Analysis options
// ---------------------------------------------------------------------------

export interface AnalysisOptions {
  /** Maximum number of solver iterations. */
  maxIterations?: number;
  /** Convergence tolerance (absolute or relative depending on solver). */
  tolerance?: number;
  /** Mission time override — takes precedence over ModelIR.missionTime. */
  missionTime?: ValueRef;
  /** Time points at which to evaluate transient solutions. */
  timePoints?: number[];
  /** Number of Monte Carlo samples if applicable. */
  monteCarloSamples?: number;
  /** Confidence level for uncertainty bounds (0–1). */
  confidenceLevel?: number;
  /** Seed for reproducible random results. */
  seed?: number;
  /** Arbitrary solver-specific key/value options. */
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

export interface AnalyzeRequest {
  modelIR: ModelIR;
  method: AnalysisMethod;
  options: AnalysisOptions;
  executionTarget: 'browser' | 'server';
}

export interface Warning {
  code: string;
  message: string;
}

export interface AnalyzeResponse {
  /** Whether the analysis completed successfully. */
  status: 'success' | 'error' | 'partial';
  /** Information about the solver that produced this result. */
  solver: {
    name: string;
    version: string;
  };
  /** Version of the ModelIR schema used. */
  modelIRVersion: string;
  /** SHA-256 (or equivalent) hash of the input ModelIR for traceability. */
  contentHash: string;

  // ── Core results ──────────────────────────────────────────────────────

  /**
   * Primary output metrics keyed by metric name.
   * E.g. `{ "availability": 0.9987, "mttf": 43200 }`.
   */
  metrics: Record<string, number | number[]>;

  /**
   * Per-component or per-event contribution to the result.
   * E.g. importance measures, sensitivity indices.
   */
  contributions: Record<string, Record<string, number>>;

  // ── Numeric metadata ──────────────────────────────────────────────────

  numericMetadata: {
    method: string;
    tolerance: number;
    iterations: number;
    residualNorm: number;
    truncation: number;
    stiffnessDetected: boolean;
    methodAutoSelected: boolean;
  };

  // ── Trace / provenance ────────────────────────────────────────────────

  trace: {
    assumptions: string[];
    normalizations: string[];
    unitConversions: string[];
    simplifications: string[];
    methodDetails: string;
  };

  // ── Diagnostics ───────────────────────────────────────────────────────

  warnings: Warning[];

  /**
   * Upper and lower bounds on the primary metric(s) where applicable.
   */
  errorBounds: Record<string, { lower: number; upper: number }>;

  /** Wall-clock compute time in milliseconds. */
  computeTimeMs: number;

  /** ISO-8601 timestamp of when the result was produced. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Solver interface — implemented by each concrete solver
// ---------------------------------------------------------------------------

export interface Solver {
  readonly name: string;
  readonly version: string;
  readonly supportedMethods: AnalysisMethod[];
  analyze(request: AnalyzeRequest): Promise<AnalyzeResponse>;
}

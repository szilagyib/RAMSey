import type { ModelIR } from '../ir/schema.js';
import type { AnalyzeResponse, Warning } from './interface.js';

/**
 * Deterministic, fast (non-cryptographic) content hash of the model IR — FNV-1a
 * over canonical JSON. Used for result traceability, not security.
 */
export function contentHash(modelIR: ModelIR): string {
  const json = JSON.stringify(modelIR);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'fnv1a-' + (h >>> 0).toString(16).padStart(8, '0');
}

export interface BuildResponseInput {
  solverName: string;
  solverVersion: string;
  modelIR: ModelIR;
  method: string;
  startTime: number;
  status?: AnalyzeResponse['status'];
  metrics?: Record<string, number | number[]>;
  contributions?: Record<string, Record<string, number>>;
  numericMetadata?: Partial<AnalyzeResponse['numericMetadata']>;
  trace?: Partial<AnalyzeResponse['trace']>;
  warnings?: Warning[];
  errorBounds?: Record<string, { lower: number; upper: number }>;
}

/** Assemble a complete AnalyzeResponse, filling provenance and defaults. */
export function buildResponse(input: BuildResponseInput): AnalyzeResponse {
  return {
    status: input.status ?? 'success',
    solver: { name: input.solverName, version: input.solverVersion },
    modelIRVersion: input.modelIR.version,
    contentHash: contentHash(input.modelIR),
    metrics: input.metrics ?? {},
    contributions: input.contributions ?? {},
    numericMetadata: {
      method: input.method,
      tolerance: 0,
      iterations: 0,
      residualNorm: 0,
      truncation: 0,
      stiffnessDetected: false,
      methodAutoSelected: false,
      ...input.numericMetadata,
    },
    trace: {
      assumptions: [],
      normalizations: [],
      unitConversions: [],
      simplifications: [],
      methodDetails: '',
      ...input.trace,
    },
    warnings: input.warnings ?? [],
    errorBounds: input.errorBounds ?? {},
    computeTimeMs: Date.now() - input.startTime,
    timestamp: new Date().toISOString(),
  };
}

/** A clean error response for unsupported methods or invalid models. */
export function errorResponse(
  modelIR: ModelIR,
  method: string,
  message: string,
  solverName: string,
  startTime: number,
): AnalyzeResponse {
  return buildResponse({
    solverName,
    solverVersion: '0.1.0',
    modelIR,
    method,
    startTime,
    status: 'error',
    warnings: [{ code: 'unsupported', message }],
  });
}

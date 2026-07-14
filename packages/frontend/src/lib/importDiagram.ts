import type { Node, Edge } from '@xyflow/react';

/**
 * Parse + validate a diagram JSON file (the shape produced by exportJson and
 * shipped in examples/). Returns the loadable payload or a short error string.
 */
export interface ImportedDiagram {
  name?: string;
  type?: string;
  nodes: Node[];
  edges: Edge[];
}

const MAX_NODES = 600;
const MAX_EDGES = 1200;

/** Highest export schemaVersion this importer understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

export function parseDiagramJson(text: string): ImportedDiagram | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'Not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object') return { error: 'Not a diagram file.' };

  const obj = raw as Record<string, unknown>;

  // Files without a version predate versioning and are treated as v1.
  const version = obj.schemaVersion === undefined ? 1 : obj.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { error: 'Invalid schemaVersion.' };
  }
  if (version > SUPPORTED_SCHEMA_VERSION) {
    return {
      error: `This file uses format version ${version}; this app supports up to ${SUPPORTED_SCHEMA_VERSION}. Update RAMSey to import it.`,
    };
  }
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    return { error: 'Missing nodes/edges arrays.' };
  }
  if (obj.nodes.length === 0) return { error: 'The file contains no nodes.' };
  if (obj.nodes.length > MAX_NODES || obj.edges.length > MAX_EDGES) {
    return { error: 'The diagram is too large to import.' };
  }

  for (const n of obj.nodes) {
    const node = n as Partial<Node>;
    if (
      typeof node?.id !== 'string' ||
      typeof node?.position?.x !== 'number' ||
      typeof node?.position?.y !== 'number' ||
      typeof node?.data !== 'object'
    ) {
      return { error: 'A node is malformed (needs id, position, data).' };
    }
  }

  const nodeIds = new Set((obj.nodes as Node[]).map((n) => n.id));
  for (const e of obj.edges) {
    const edge = e as Partial<Edge>;
    if (
      typeof edge?.id !== 'string' ||
      typeof edge?.source !== 'string' ||
      typeof edge?.target !== 'string'
    ) {
      return { error: 'An edge is malformed (needs id, source, target).' };
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return { error: `Edge "${edge.id}" references a missing node.` };
    }
  }

  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    type: typeof obj.type === 'string' ? obj.type : undefined,
    nodes: obj.nodes as Node[],
    edges: obj.edges as Edge[],
  };
}

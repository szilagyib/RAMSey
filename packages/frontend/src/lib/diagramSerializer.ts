import type { Node, Edge } from '@xyflow/react';

/**
 * Serializes the current diagram state into a compact object
 * suitable for sending to the AI chat endpoint as context.
 */
export function serializeDiagramContext(
  nodes: Node[],
  edges: Edge[],
  diagramType: string,
  diagramName?: string,
) {
  return {
    diagramType,
    diagramName,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data as Record<string, unknown>,
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: (e.data ?? {}) as Record<string, unknown>,
    })),
  };
}

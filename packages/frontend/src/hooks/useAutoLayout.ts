import { useCallback } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

// ---------------------------------------------------------------------------
// ELK layout options
// ---------------------------------------------------------------------------

export interface AutoLayoutOptions {
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  spacing?: number;
  nodeWidth?: number;
  nodeHeight?: number;
}

const DEFAULT_OPTIONS: Required<AutoLayoutOptions> = {
  direction: 'RIGHT',
  spacing: 80,
  nodeWidth: 64,
  nodeHeight: 64,
};

// ---------------------------------------------------------------------------
// Core layout function
// ---------------------------------------------------------------------------

export async function autoLayout(
  nodes: Node[],
  edges: Edge[],
  options: AutoLayoutOptions = {},
): Promise<Node[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) {
    return [];
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': opts.direction,
      // Generous node/edge separation so neither nodes nor edges overlap;
      // orthogonal routing makes ELK reserve real corridors between nodes
      // for the edges instead of letting them cut across.
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(opts.spacing),
      'elk.spacing.edgeNode': String(opts.spacing / 2),
      'elk.spacing.edgeEdge': String(opts.spacing / 3),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.spacing),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(opts.spacing / 2),
      'elk.layered.spacing.edgeEdgeBetweenLayers': String(opts.spacing / 3),
    },
    children: nodes.map((node) => {
      // Use the real rendered size when React Flow has measured it — the
      // fixed fallback under-sized wide nodes (128px boxes), which let the
      // layout place them overlapping.
      const measured = (node as { measured?: { width?: number; height?: number } }).measured;
      return {
        id: node.id,
        width: measured?.width ?? node.width ?? opts.nodeWidth,
        height: measured?.height ?? node.height ?? opts.nodeHeight,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutResult = await elk.layout(elkGraph);

  const layoutedNodes = nodes.map((node) => {
    const layoutedNode = layoutResult.children?.find((n) => n.id === node.id);
    if (layoutedNode) {
      return {
        ...node,
        position: {
          x: layoutedNode.x ?? node.position.x,
          y: layoutedNode.y ?? node.position.y,
        },
      };
    }
    return node;
  });

  return layoutedNodes;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useAutoLayout() {
  const runLayout = useCallback(
    async (
      nodes: Node[],
      edges: Edge[],
      options?: AutoLayoutOptions,
    ): Promise<Node[]> => {
      return autoLayout(nodes, edges, options);
    },
    [],
  );

  return { autoLayout: runLayout };
}

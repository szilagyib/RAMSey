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
      'elk.spacing.nodeNode': String(opts.spacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.spacing),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(opts.spacing / 2),
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    })),
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

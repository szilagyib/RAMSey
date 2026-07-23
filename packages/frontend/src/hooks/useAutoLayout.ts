import { useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';

// elkjs is ~1.4 MB. It's only needed when the user runs Auto Layout, so load
// it on demand instead of in the editor's initial bundle. Cached after first use.
let elkPromise: Promise<{ layout: (g: unknown) => Promise<ElkResult> }> | null = null;
interface ElkResult {
  children?: Array<{ id: string; x?: number; y?: number }>;
}
async function getElk() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then(
      (m) => new m.default() as { layout: (g: unknown) => Promise<ElkResult> },
    );
  }
  return elkPromise;
}

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
  // Roomy by default: cramped layouts push edge labels on top of nodes and
  // each other. Space costs nothing on an infinite canvas.
  spacing: 120,
  nodeWidth: 64,
  nodeHeight: 64,
};

/** Perpendicular offset applied to each side of a bidirectional edge pair. */
const PAIR_ARC = 70;

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

  const elk = await getElk();
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
// Edge routing after layout
// ---------------------------------------------------------------------------

/**
 * Give every edge a control point that keeps it visible after a re-layout.
 *
 * Bidirectional pairs (A→B and B→A — a failure/repair pair in a Markov chain,
 * say) would otherwise be drawn on the exact same straight line, hiding one
 * edge and stacking both rate labels. Each side gets a perpendicular offset in
 * the opposite direction, so the pair arcs apart symmetrically. Single edges
 * are left on automatic routing (control point cleared).
 *
 * Returns new edges; positions come from the freshly laid-out nodes.
 */
export function routeEdgesAfterLayout(nodes: Node[], edges: Edge[]): Edge[] {
  const center = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const w = (n as { measured?: { width?: number } }).measured?.width ?? n.width ?? 64;
    const h = (n as { measured?: { height?: number } }).measured?.height ?? n.height ?? 64;
    center.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 });
  }

  const hasReverse = (e: Edge) => edges.some((o) => o.source === e.target && o.target === e.source);

  return edges.map((e) => {
    const data = { ...(e.data ?? {}) } as Record<string, unknown>;
    const a = center.get(e.source);
    const b = center.get(e.target);

    // Self-loops (source === target) render their own fixed loop in the edge
    // component; a control point here would just be a degenerate point at the
    // node centre, dragging the loop under the node.
    if (e.source === e.target || !a || !b || !hasReverse(e)) {
      // Straight/automatic routing.
      data.cpX = null;
      data.cpY = null;
      return { ...e, data };
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Offset along the perpendicular of THIS edge's own direction. The reverse
    // edge's (dx,dy) are negated, so its perpendicular points the other way and
    // the pair arcs to opposite sides. (A shared, id-derived sign would push
    // both edges the same way — they'd still overlap.)
    data.cpX = (a.x + b.x) / 2 + (-dy / len) * PAIR_ARC;
    data.cpY = (a.y + b.y) / 2 + (dx / len) * PAIR_ARC;
    return { ...e, data };
  });
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useAutoLayout() {
  const runLayout = useCallback(
    async (nodes: Node[], edges: Edge[], options?: AutoLayoutOptions): Promise<Node[]> => {
      return autoLayout(nodes, edges, options);
    },
    [],
  );

  return { autoLayout: runLayout };
}

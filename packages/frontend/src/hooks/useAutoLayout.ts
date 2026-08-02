import { useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { getControlPoint } from '../diagram-types/shared/edgeShape';

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

type Point = { x: number; y: number };

function centersOf(nodes: Node[]): Map<string, Point> {
  const center = new Map<string, Point>();
  for (const n of nodes) {
    const w = (n as { measured?: { width?: number } }).measured?.width ?? n.width ?? 64;
    const h = (n as { measured?: { height?: number } }).measured?.height ?? n.height ?? 64;
    center.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 });
  }
  return center;
}

/**
 * Carry a control point into the edge's new frame.
 *
 * Control points are absolute flow coordinates, so after a re-layout a
 * hand-placed one would sit wherever the nodes used to be. Decompose it against
 * the old endpoints — how far along the edge, how deep to the side — and
 * rebuild it from the new ones, so the bend the user drew follows its endpoints
 * instead of being discarded as stale.
 */
function remapControlPoint(cp: Point, a0: Point, b0: Point, a: Point, b: Point): Point {
  const len0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  // The old endpoints coincided, so there is no direction to decompose
  // against; the point can only follow the source node.
  if (len0 === 0) return { x: a.x + (cp.x - a0.x), y: a.y + (cp.y - a0.y) };

  const ux = (b0.x - a0.x) / len0;
  const uy = (b0.y - a0.y) / len0;
  const rx = cp.x - a0.x;
  const ry = cp.y - a0.y;
  // Along the edge as a fraction of its length, so the bend stays put when the
  // layout stretches it; across it in px, so the bend keeps its depth.
  const along = (rx * ux + ry * uy) / len0;
  const aside = rx * -uy + ry * ux;

  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return { x: a.x, y: a.y };
  const nx = (b.x - a.x) / len;
  const ny = (b.y - a.y) / len;
  return {
    x: a.x + nx * along * len + -ny * aside,
    y: a.y + ny * along * len + nx * aside,
  };
}

/**
 * Keep every edge visible and correctly shaped after a re-layout.
 *
 * A hand-placed control point is the user's edge shaping, so it is remapped
 * onto the new node positions, never dropped. Bidirectional pairs (A→B and B→A
 * — a failure/repair pair in a Markov chain, say) that have no such point would
 * otherwise be drawn on the exact same straight line, hiding one edge and
 * stacking both rate labels; each side gets a perpendicular offset in the
 * opposite direction so the pair arcs apart symmetrically. Everything else is
 * left on automatic routing.
 *
 * `previousNodes` are the positions the edges were shaped against — the nodes
 * as they were before this layout ran.
 *
 * Returns new edges; positions come from the freshly laid-out nodes.
 */
export function routeEdgesAfterLayout(nodes: Node[], edges: Edge[], previousNodes: Node[]): Edge[] {
  const center = centersOf(nodes);
  const before = centersOf(previousNodes);

  const hasReverse = (e: Edge) => edges.some((o) => o.source === e.target && o.target === e.source);

  return edges.map((e) => {
    const data = { ...(e.data ?? {}) } as Record<string, unknown>;
    const a = center.get(e.source);
    const b = center.get(e.target);

    // Self-loops (source === target) render their own fixed loop in the edge
    // component; a control point here would just be a degenerate point at the
    // node centre, dragging the loop under the node.
    if (e.source === e.target || !a || !b) {
      // Straight/automatic routing.
      data.cpX = null;
      data.cpY = null;
      return { ...e, data };
    }

    // Preserve the user's shaping. Needs the endpoints it was drawn against;
    // without them (a node this layout is seeing for the first time) there is
    // nothing to decompose, so the edge falls back to automatic routing.
    const cp = getControlPoint(e.data);
    const a0 = before.get(e.source);
    const b0 = before.get(e.target);
    if (cp && a0 && b0) {
      const moved = remapControlPoint(cp, a0, b0, a, b);
      data.cpX = moved.x;
      data.cpY = moved.y;
      return { ...e, data };
    }

    if (!hasReverse(e)) {
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

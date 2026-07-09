import type * as Y from 'yjs';

// ---------------------------------------------------------------------------
// Derive the diagram `content` JSON ({nodes, edges}) from the collaborative
// Y.Doc. This MIRRORS the frontend doc layout in
// packages/frontend/src/lib/yjsBinding.ts — keep the two in sync:
//   nodes: Y.Map<id -> Y.Map{ type, x, y, data }>
//   edges: Y.Map<id -> Y.Map{ source, target, type, data }>
// ---------------------------------------------------------------------------

interface ContentNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface ContentEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data: Record<string, unknown>;
}

export interface DiagramContent {
  nodes: ContentNode[];
  edges: ContentEdge[];
}

export function docToContent(doc: Y.Doc): DiagramContent {
  const yNodes = doc.getMap<Y.Map<unknown>>('nodes');
  const yEdges = doc.getMap<Y.Map<unknown>>('edges');

  const nodes: ContentNode[] = [...yNodes.entries()].map(([id, ym]) => ({
    id,
    type: (ym.get('type') as string | null) ?? undefined,
    position: { x: (ym.get('x') as number) ?? 0, y: (ym.get('y') as number) ?? 0 },
    data: (ym.get('data') as Record<string, unknown>) ?? {},
  }));

  const edges: ContentEdge[] = [...yEdges.entries()].map(([id, ym]) => ({
    id,
    source: ym.get('source') as string,
    target: ym.get('target') as string,
    type: (ym.get('type') as string | null) ?? undefined,
    data: (ym.get('data') as Record<string, unknown>) ?? {},
  }));

  return { nodes, edges };
}

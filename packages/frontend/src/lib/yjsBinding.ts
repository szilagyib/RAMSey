import * as Y from 'yjs';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Two-way binding between a Yjs document and the diagram store.
//
// Doc layout: `nodes` and `edges` are Y.Maps keyed by id; each entry is a
// Y.Map holding the node/edge fields. Node-level granularity means concurrent
// edits to *different* nodes merge cleanly.
// ---------------------------------------------------------------------------

/** The slice of the diagram store this binding reads and writes. */
export interface BindableStore {
  getState: () => {
    nodes: Node[];
    edges: Edge[];
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
  };
  subscribe: (
    listener: (
      state: { nodes: Node[]; edges: Edge[] },
      prev: { nodes: Node[]; edges: Edge[] },
    ) => void,
  ) => () => void;
}

const LOCAL_ORIGIN = { source: 'diagram-store' };

function nodesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>('nodes');
}
function edgesMap(doc: Y.Doc) {
  return doc.getMap<Y.Map<unknown>>('edges');
}

function setIfChanged(ym: Y.Map<unknown>, key: string, value: unknown): void {
  if (JSON.stringify(ym.get(key)) !== JSON.stringify(value)) ym.set(key, value);
}

function writeNodes(nodes: Node[], ymap: Y.Map<Y.Map<unknown>>): void {
  const ids = new Set(nodes.map((n) => n.id));
  for (const key of [...ymap.keys()]) if (!ids.has(key)) ymap.delete(key);
  for (const n of nodes) {
    let ym = ymap.get(n.id);
    if (!ym) {
      ym = new Y.Map();
      ymap.set(n.id, ym);
    }
    setIfChanged(ym, 'type', n.type ?? null);
    setIfChanged(ym, 'x', n.position.x);
    setIfChanged(ym, 'y', n.position.y);
    setIfChanged(ym, 'data', n.data ?? {});
  }
}

function writeEdges(edges: Edge[], ymap: Y.Map<Y.Map<unknown>>): void {
  const ids = new Set(edges.map((e) => e.id));
  for (const key of [...ymap.keys()]) if (!ids.has(key)) ymap.delete(key);
  for (const e of edges) {
    let ym = ymap.get(e.id);
    if (!ym) {
      ym = new Y.Map();
      ymap.set(e.id, ym);
    }
    setIfChanged(ym, 'source', e.source);
    setIfChanged(ym, 'target', e.target);
    setIfChanged(ym, 'type', e.type ?? null);
    setIfChanged(ym, 'data', e.data ?? {});
  }
}

function readNodes(ymap: Y.Map<Y.Map<unknown>>): Node[] {
  return [...ymap.entries()].map(([id, ym]) => ({
    id,
    type: (ym.get('type') as string | null) ?? undefined,
    position: { x: (ym.get('x') as number) ?? 0, y: (ym.get('y') as number) ?? 0 },
    data: (ym.get('data') as Record<string, unknown>) ?? {},
  }));
}

function readEdges(ymap: Y.Map<Y.Map<unknown>>): Edge[] {
  return [...ymap.entries()].map(([id, ym]) => ({
    id,
    source: ym.get('source') as string,
    target: ym.get('target') as string,
    type: (ym.get('type') as string | null) ?? undefined,
    data: (ym.get('data') as Record<string, unknown>) ?? {},
  }));
}

/** Push the current store contents into the doc (used to seed an empty doc). */
export function pushStoreToDoc(doc: Y.Doc, store: BindableStore): void {
  const { nodes, edges } = store.getState();
  doc.transact(() => {
    writeNodes(nodes, nodesMap(doc));
    writeEdges(edges, edgesMap(doc));
  }, LOCAL_ORIGIN);
}

/** Replace the store contents with the doc contents. */
export function loadDocToStore(doc: Y.Doc, store: BindableStore): void {
  store.getState().setNodes(readNodes(nodesMap(doc)));
  store.getState().setEdges(readEdges(edgesMap(doc)));
}

/**
 * Establish ongoing two-way sync between `doc` and `store`. Local store changes
 * are written to the doc under a local origin; remote doc changes (any other
 * origin) are pushed to the store. Returns an unbind function.
 */
export function bindStore(doc: Y.Doc, store: BindableStore): () => void {
  const yNodes = nodesMap(doc);
  const yEdges = edgesMap(doc);
  let applyingRemote = false;

  const observer = (_events: unknown, txn: Y.Transaction) => {
    if (txn.origin === LOCAL_ORIGIN) return; // our own write — ignore
    applyingRemote = true;
    store.getState().setNodes(readNodes(yNodes));
    store.getState().setEdges(readEdges(yEdges));
    applyingRemote = false;
  };
  yNodes.observeDeep(observer);
  yEdges.observeDeep(observer);

  const unsubscribe = store.subscribe((state, prev) => {
    if (applyingRemote) return;
    if (state.nodes === prev.nodes && state.edges === prev.edges) return;
    doc.transact(() => {
      writeNodes(state.nodes, yNodes);
      writeEdges(state.edges, yEdges);
    }, LOCAL_ORIGIN);
  });

  return () => {
    yNodes.unobserveDeep(observer);
    yEdges.unobserveDeep(observer);
    unsubscribe();
  };
}

/** True if the doc holds no nodes and no edges (an unseeded document). */
export function isDocEmpty(doc: Y.Doc): boolean {
  return nodesMap(doc).size === 0 && edgesMap(doc).size === 0;
}

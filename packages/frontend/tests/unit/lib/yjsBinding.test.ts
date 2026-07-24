import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createStore } from 'zustand/vanilla';
import type { Node, Edge } from '@xyflow/react';
import { bindStore, type BindableStore } from '../../../src/lib/yjsBinding';

function makeStore() {
  const vanilla = createStore<{ nodes: Node[]; edges: Edge[] }>(() => ({ nodes: [], edges: [] }));
  const store: BindableStore = {
    getState: () => ({
      nodes: vanilla.getState().nodes,
      edges: vanilla.getState().edges,
      setNodes: (nodes) => vanilla.setState({ nodes }),
      setEdges: (edges) => vanilla.setState({ edges }),
    }),
    subscribe: (listener) => vanilla.subscribe(listener),
  };
  return { store, vanilla };
}

const node = (id: string, data: Record<string, unknown> = {}): Node =>
  ({ id, type: 'stateNode', position: { x: 0, y: 0 }, data }) as Node;

describe('bindStore', () => {
  it('syncs node/edge changes both ways between two documents', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    // Relay updates between the two docs, simulating two clients + a server.
    doc1.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin !== 'relay') Y.applyUpdate(doc2, u, 'relay');
    });
    doc2.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin !== 'relay') Y.applyUpdate(doc1, u, 'relay');
    });

    const a = makeStore();
    const b = makeStore();
    bindStore(doc1, a.store);
    bindStore(doc2, b.store);

    // Client A adds a node → should appear on B.
    a.store.getState().setNodes([node('n1', { label: 'A' })]);
    expect(b.vanilla.getState().nodes.map((n) => n.id)).toEqual(['n1']);
    expect(b.vanilla.getState().nodes[0].data).toEqual({ label: 'A' });

    // Client B adds a node → both have n1 + n2.
    b.store.getState().setNodes([...b.vanilla.getState().nodes, node('n2')]);
    expect(
      a.vanilla
        .getState()
        .nodes.map((n) => n.id)
        .sort(),
    ).toEqual(['n1', 'n2']);

    // Client A updates n1's data → propagates to B.
    a.store
      .getState()
      .setNodes(
        a.vanilla
          .getState()
          .nodes.map((n) => (n.id === 'n1' ? { ...n, data: { label: 'A2' } } : n)),
      );
    expect(b.vanilla.getState().nodes.find((n) => n.id === 'n1')?.data).toEqual({ label: 'A2' });

    // Deletion propagates.
    a.store.getState().setNodes(a.vanilla.getState().nodes.filter((n) => n.id !== 'n2'));
    expect(b.vanilla.getState().nodes.map((n) => n.id)).toEqual(['n1']);
  });

  it('does not echo local writes back into the store (no loop)', () => {
    const doc = new Y.Doc();
    const { store, vanilla } = makeStore();
    bindStore(doc, store);
    let notifications = 0;
    vanilla.subscribe(() => (notifications += 1));
    store.getState().setNodes([node('x')]);
    // One local change → exactly one store notification (no echo from the doc observer).
    expect(notifications).toBe(1);
  });
});

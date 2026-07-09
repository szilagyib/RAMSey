import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { docToContent } from '../../../src/collab/projection.js';

/** Build a doc the way the frontend binding does (nodes/edges maps of maps). */
function buildDoc(): Y.Doc {
  const doc = new Y.Doc();
  const nodes = doc.getMap('nodes');
  const edges = doc.getMap('edges');
  doc.transact(() => {
    const n1 = new Y.Map<unknown>();
    n1.set('type', 'stateNode');
    n1.set('x', 10);
    n1.set('y', 20);
    n1.set('data', { label: 'S0', stateType: 'operational' });
    nodes.set('S0', n1);

    const n2 = new Y.Map<unknown>();
    n2.set('type', 'stateNode');
    n2.set('x', 200);
    n2.set('y', 20);
    n2.set('data', { label: 'S1' });
    nodes.set('S1', n2);

    const e1 = new Y.Map<unknown>();
    e1.set('source', 'S0');
    e1.set('target', 'S1');
    e1.set('type', 'transitionEdge');
    e1.set('data', { rate: '0.01' });
    edges.set('t0', e1);
  });
  return doc;
}

describe('docToContent', () => {
  it('projects the Y.Doc into React-Flow-shaped content', () => {
    const content = docToContent(buildDoc());
    expect(content.nodes).toHaveLength(2);
    expect(content.nodes[0]).toEqual({
      id: 'S0',
      type: 'stateNode',
      position: { x: 10, y: 20 },
      data: { label: 'S0', stateType: 'operational' },
    });
    expect(content.edges).toHaveLength(1);
    expect(content.edges[0]).toMatchObject({
      id: 't0',
      source: 'S0',
      target: 'S1',
      type: 'transitionEdge',
      data: { rate: '0.01' },
    });
  });

  it('round-trips through encode/apply (what the server persists)', () => {
    const update = Y.encodeStateAsUpdate(buildDoc());
    const restored = new Y.Doc();
    Y.applyUpdate(restored, update);
    const content = docToContent(restored);
    expect(content.nodes.map((n) => n.id).sort()).toEqual(['S0', 'S1']);
    expect(content.edges[0].source).toBe('S0');
  });

  it('returns empty arrays for an empty doc', () => {
    expect(docToContent(new Y.Doc())).toEqual({ nodes: [], edges: [] });
  });
});

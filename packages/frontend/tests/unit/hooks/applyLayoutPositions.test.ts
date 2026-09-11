import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { applyLayoutPositions } from '../../../src/hooks/useAutoLayout';

const node = (id: string, x: number, y: number, data: object = {}): Node => ({
  id,
  position: { x, y },
  data,
});

// Auto Layout is async: elkjs is fetched on demand and the layout itself takes
// time. The diagram keeps changing while it runs — the user adds a node, a
// collaborator's edit arrives over Yjs — so the result is merged into the
// current state instead of overwriting it with the snapshot it started from.
describe('applyLayoutPositions', () => {
  it('moves the nodes the layout placed', () => {
    const current = [node('a', 0, 0), node('b', 0, 0)];
    const layouted = [node('a', 10, 20), node('b', 30, 40)];

    expect(applyLayoutPositions(current, layouted)?.map((n) => n.position)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('keeps a node added while the layout ran', () => {
    const layouted = [node('a', 10, 20)];
    const current = [node('a', 0, 0), node('new', 500, 500)];

    const merged = applyLayoutPositions(current, layouted);

    // The newcomer was never laid out, so it stays where it was put rather
    // than vanishing when the layout is written back.
    expect(merged?.map((n) => n.id)).toEqual(['a', 'new']);
    expect(merged?.[1].position).toEqual({ x: 500, y: 500 });
  });

  it('does not resurrect a node deleted while the layout ran', () => {
    const layouted = [node('a', 10, 20), node('gone', 99, 99)];
    const current = [node('a', 0, 0)];

    expect(applyLayoutPositions(current, layouted)?.map((n) => n.id)).toEqual(['a']);
  });

  it('keeps edits made to a node while the layout ran', () => {
    const layouted = [node('a', 10, 20, { label: 'old' })];
    const current = [node('a', 0, 0, { label: 'renamed' })];

    const merged = applyLayoutPositions(current, layouted);

    // Only the position comes from the layout; everything else is the live node.
    expect(merged?.[0].data).toEqual({ label: 'renamed' });
    expect(merged?.[0].position).toEqual({ x: 10, y: 20 });
  });

  it('returns null when the diagram was replaced while the layout ran', () => {
    const layouted = [node('a', 10, 20), node('b', 30, 40)];
    const current = [node('other-1', 0, 0), node('other-2', 0, 0)];

    // Nothing in common: the user navigated away or imported a file. Applying
    // anything here would shuffle a diagram the user never asked to lay out.
    expect(applyLayoutPositions(current, layouted)).toBeNull();
  });

  it('returns null when the layout produced nothing', () => {
    expect(applyLayoutPositions([node('a', 0, 0)], [])).toBeNull();
  });

  it('leaves the caller-supplied arrays untouched', () => {
    const current = [node('a', 0, 0)];
    applyLayoutPositions(current, [node('a', 10, 20)]);
    expect(current[0].position).toEqual({ x: 0, y: 0 });
  });
});

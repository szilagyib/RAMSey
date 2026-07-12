import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node } from '@xyflow/react';
import { useDiagramStore } from '../../../src/stores/diagramStore';

vi.mock('../../../src/diagram-types/markov-chain/validation', () => ({
  validateMarkovDiagram: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));
vi.mock('../../../src/diagram-types/markov-chain/defaults', () => ({
  createNewState: vi.fn(),
  createNewTransition: vi.fn(),
  createNode: vi.fn((position: { x: number; y: number }, counter: number) => ({
    id: `state-${counter}`,
    type: 'stateNode',
    position,
    data: { label: `S${counter}` },
  })),
  createEdge: vi.fn(),
}));

const state = () => useDiagramStore.getState();

/** Seed selected nodes with explicit sizes (align/distribute are size-aware). */
function seed(nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>) {
  const seeded: Node[] = nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: {},
    width: n.w,
    height: n.h,
    selected: true,
  }));
  state().loadDiagram(seeded, [], 'markov_chain');
}

const posOf = (id: string) => state().nodes.find((n) => n.id === id)!.position;

describe('alignSelection', () => {
  beforeEach(() => {
    // 3 nodes of different sizes at scattered positions.
    seed([
      { id: 'a', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', x: 100, y: 50, w: 80, h: 20 },
      { id: 'c', x: 200, y: 90, w: 60, h: 60 },
    ]);
  });

  it('aligns left edges', () => {
    state().alignSelection('left');
    expect([posOf('a').x, posOf('b').x, posOf('c').x]).toEqual([0, 0, 0]);
  });

  it('aligns right edges accounting for differing widths', () => {
    state().alignSelection('right');
    // Rightmost edge is c: 200 + 60 = 260.
    expect(posOf('a').x + 40).toBe(260);
    expect(posOf('b').x + 80).toBe(260);
    expect(posOf('c').x + 60).toBe(260);
  });

  it('aligns top edges', () => {
    state().alignSelection('top');
    expect([posOf('a').y, posOf('b').y, posOf('c').y]).toEqual([0, 0, 0]);
  });

  it('aligns bottom edges accounting for differing heights', () => {
    state().alignSelection('bottom');
    const bottom = 90 + 60; // node c
    expect(posOf('a').y + 40).toBe(bottom);
    expect(posOf('b').y + 20).toBe(bottom);
    expect(posOf('c').y + 60).toBe(bottom);
  });

  it('centers horizontally (equal centers, not equal left edges)', () => {
    state().alignSelection('center-x');
    const centers = ['a', 'b', 'c'].map((id, i) => posOf(id).x + [40, 80, 60][i] / 2);
    expect(centers[0]).toBeCloseTo(centers[1], 5);
    expect(centers[1]).toBeCloseTo(centers[2], 5);
  });

  it('centers vertically', () => {
    state().alignSelection('center-y');
    const centers = ['a', 'b', 'c'].map((id, i) => posOf(id).y + [40, 20, 60][i] / 2);
    expect(centers[0]).toBeCloseTo(centers[1], 5);
    expect(centers[1]).toBeCloseTo(centers[2], 5);
  });

  it('does not touch the perpendicular axis', () => {
    const before = { a: posOf('a').y, b: posOf('b').y, c: posOf('c').y };
    state().alignSelection('left');
    expect(posOf('a').y).toBe(before.a);
    expect(posOf('b').y).toBe(before.b);
    expect(posOf('c').y).toBe(before.c);
  });

  it('records one undo entry and is revertible', () => {
    const before = posOf('b').x;
    const undos = state().undoStack.length;
    state().alignSelection('left');
    expect(state().undoStack.length).toBe(undos + 1);
    state().undo();
    expect(posOf('b').x).toBe(before);
  });

  it('is a no-op with fewer than two nodes selected', () => {
    seed([{ id: 'solo', x: 5, y: 5, w: 40, h: 40 }]);
    const undos = state().undoStack.length;
    state().alignSelection('left');
    expect(posOf('solo').x).toBe(5);
    expect(state().undoStack.length).toBe(undos);
  });
});

describe('distributeSelection', () => {
  it('evens out horizontal gaps while keeping the outer nodes fixed', () => {
    seed([
      { id: 'a', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', x: 50, y: 0, w: 40, h: 40 }, // bunched near the left
      { id: 'c', x: 300, y: 0, w: 40, h: 40 },
    ]);
    state().distributeSelection('horizontal');

    // Outer nodes unchanged.
    expect(posOf('a').x).toBe(0);
    expect(posOf('c').x).toBe(300);
    // Equal gaps: (340 total span - 120 widths) / 2 = 110 each.
    const gap1 = posOf('b').x - (posOf('a').x + 40);
    const gap2 = posOf('c').x - (posOf('b').x + 40);
    expect(gap1).toBeCloseTo(gap2, 5);
  });

  it('evens out vertical gaps', () => {
    seed([
      { id: 'a', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', x: 0, y: 20, w: 40, h: 40 },
      { id: 'c', x: 0, y: 200, w: 40, h: 40 },
    ]);
    state().distributeSelection('vertical');
    const gap1 = posOf('b').y - (posOf('a').y + 40);
    const gap2 = posOf('c').y - (posOf('b').y + 40);
    expect(gap1).toBeCloseTo(gap2, 5);
  });

  it('needs three nodes — two is a no-op', () => {
    seed([
      { id: 'a', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', x: 100, y: 0, w: 40, h: 40 },
    ]);
    const undos = state().undoStack.length;
    state().distributeSelection('horizontal');
    expect(posOf('b').x).toBe(100);
    expect(state().undoStack.length).toBe(undos);
  });
});

describe('nudgeSelection', () => {
  beforeEach(() => {
    seed([
      { id: 'a', x: 100, y: 100, w: 40, h: 40 },
      { id: 'b', x: 200, y: 100, w: 40, h: 40 },
    ]);
  });

  it('moves every selected node by the delta', () => {
    state().nudgeSelection(16, -16);
    expect(posOf('a')).toEqual({ x: 116, y: 84 });
    expect(posOf('b')).toEqual({ x: 216, y: 84 });
  });

  it('coalesces a burst of nudges into one undo entry', () => {
    const undos = state().undoStack.length;
    state().nudgeSelection(16, 0);
    state().nudgeSelection(16, 0);
    state().nudgeSelection(16, 0);
    expect(state().undoStack.length).toBe(undos + 1);

    state().undo();
    expect(posOf('a').x).toBe(100); // whole burst reverted
  });

  it('does nothing without a selection', () => {
    state().clearSelection();
    state().nudgeSelection(16, 0);
    expect(posOf('a').x).toBe(100);
  });
});

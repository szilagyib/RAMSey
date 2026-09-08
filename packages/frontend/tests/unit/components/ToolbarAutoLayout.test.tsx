import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import type { Node, Edge } from '@xyflow/react';

// The layout call is the only thing stubbed: the test drives when it settles so
// it can mutate the diagram mid-flight, exactly as a collaborator or the user
// would. Everything else in useAutoLayout (routing, position merging) is real.
const mocks = vi.hoisted(() => ({
  autoLayout: vi.fn<(nodes: Node[], edges: Edge[], options?: unknown) => Promise<Node[]>>(),
  fitView: vi.fn(),
}));

vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useReactFlow: () => ({ fitView: mocks.fitView }),
}));

vi.mock('../../../src/hooks/useAutoLayout', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAutoLayout: () => ({ autoLayout: mocks.autoLayout }),
}));

vi.mock('../../../src/contexts/auth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../../src/components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../../../src/components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }));

import { Toolbar } from '../../../src/components/editor/Toolbar';
import { useDiagramStore } from '../../../src/stores/diagramStore';

const node = (id: string, x: number, y: number): Node => ({
  id,
  type: 'stateNode',
  position: { x, y },
  data: { label: id },
});

const renderToolbar = () => render(<Toolbar onRename={() => {}} />);
const autoLayoutButton = () => screen.getByTitle('Auto Layout');

/** A promise the test settles by hand, so it can act while the layout is pending. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.autoLayout.mockReset();
  mocks.fitView.mockReset();
  useDiagramStore.setState({
    nodes: [node('a', 0, 0), node('b', 0, 0)],
    edges: [{ id: 'e1', source: 'a', target: 'b', data: {} }],
    diagramType: 'markov_chain',
    undoStack: [],
    redoStack: [],
    selectedNodeId: null,
    selectedEdgeId: null,
  });
});
afterEach(cleanup);

// Auto Layout is asynchronous — elkjs is fetched on demand, then the layout
// runs — and the diagram does not hold still while it works. Writing back the
// snapshot the layout started from reverts everything that happened meanwhile,
// and the Yjs binding broadcasts that revert to every other peer.
describe('Toolbar — Auto Layout', () => {
  it('applies the new positions', async () => {
    mocks.autoLayout.mockResolvedValue([node('a', 100, 0), node('b', 300, 0)]);

    renderToolbar();
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });

    expect(useDiagramStore.getState().nodes.map((n) => n.position.x)).toEqual([100, 300]);
  });

  it('keeps a node added while the layout was running', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    act(() => {
      fireEvent.click(autoLayoutButton());
    });

    // A collaborator's node arrives over Yjs (or the user drops one) mid-layout.
    act(() => {
      useDiagramStore.setState({ nodes: [...useDiagramStore.getState().nodes, node('c', 9, 9)] });
    });

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    const { nodes } = useDiagramStore.getState();
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    // The newcomer was never laid out, so it keeps the position it arrived with.
    expect(nodes[2].position).toEqual({ x: 9, y: 9 });
    expect(nodes.map((n) => n.position.x).slice(0, 2)).toEqual([100, 300]);
  });

  it('keeps an edge added while the layout was running', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    act(() => {
      fireEvent.click(autoLayoutButton());
    });

    act(() => {
      useDiagramStore.setState({
        edges: [
          ...useDiagramStore.getState().edges,
          { id: 'e2', source: 'b', target: 'a', data: {} },
        ],
      });
    });

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    expect(useDiagramStore.getState().edges.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('keeps a label edited while the layout was running', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    act(() => {
      fireEvent.click(autoLayoutButton());
    });

    act(() => {
      useDiagramStore.getState().updateNodeData('a', { label: 'renamed' });
    });

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    const a = useDiagramStore.getState().nodes[0];
    expect(a.data.label).toBe('renamed');
    expect(a.position).toEqual({ x: 100, y: 0 });
  });

  it('leaves the canvas alone when the diagram was replaced mid-layout', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    act(() => {
      fireEvent.click(autoLayoutButton());
    });

    // Navigating to another diagram (or importing a file) swaps the contents.
    const other = [node('x', 5, 5), node('y', 6, 6)];
    act(() => {
      useDiagramStore.getState().loadDiagram(other, [], 'markov_chain');
    });

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    // Nothing in common with the layout: shuffling this diagram would be
    // rearranging one the user never asked to lay out.
    expect(useDiagramStore.getState().nodes.map((n) => n.position)).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 6 },
    ]);
    expect(useDiagramStore.getState().undoStack).toHaveLength(0);
  });

  // Auto Layout is reachable from the toolbar button and the View menu, and
  // nothing stopped a second run starting while the first was still in flight.
  // The merge handles "someone else changed the diagram"; it cannot help when
  // the other actor is a second copy of this same action, each seeded with the
  // snapshot it captured and the later one overwriting the earlier.
  it('ignores a second run while one is already in flight', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    const button = autoLayoutButton();
    // Both in one tick, before React re-renders the button as disabled — so
    // this exercises the guard itself rather than the disabled attribute.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(mocks.autoLayout).toHaveBeenCalledTimes(1);

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    // One user intent, one undo entry.
    expect(useDiagramStore.getState().undoStack).toHaveLength(1);
  });

  // The guard covers the menu entry, but nothing told the user: the toolbar
  // button greys out and reads "Laying out…" while the menu item still looked
  // live and silently did nothing — the same "makes the button look broken"
  // complaint the failure path already answers.
  it('disables the View-menu entry while a layout is in flight', async () => {
    const layout = deferred<Node[]>();
    mocks.autoLayout.mockReturnValue(layout.promise);

    renderToolbar();
    act(() => {
      fireEvent.click(autoLayoutButton());
    });

    const menuEntry = () =>
      screen.getByRole('button', { name: 'Auto Layout' }) as HTMLButtonElement;

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(menuEntry().disabled).toBe(true);

    await act(async () => {
      layout.resolve([node('a', 100, 0), node('b', 300, 0)]);
      await layout.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(menuEntry().disabled).toBe(false);
  });

  it('allows a new run once the previous one has finished', async () => {
    mocks.autoLayout.mockResolvedValue([node('a', 100, 0), node('b', 300, 0)]);

    renderToolbar();
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });

    expect(mocks.autoLayout).toHaveBeenCalledTimes(2);
  });

  it('releases the in-flight guard when the layout fails', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mocks.autoLayout.mockRejectedValue(new Error('boom'));

    renderToolbar();
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });

    // A failed run must not wedge the button for the rest of the session.
    expect(mocks.autoLayout).toHaveBeenCalledTimes(2);
    alert.mockRestore();
  });

  it('reports a failed layout instead of doing nothing', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    // What a tab left open across a deploy hits: the elkjs chunk is gone.
    mocks.autoLayout.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));

    renderToolbar();
    await act(async () => {
      fireEvent.click(autoLayoutButton());
    });

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toContain('Auto layout failed');
    expect(useDiagramStore.getState().nodes.map((n) => n.position.x)).toEqual([0, 0]);
    alert.mockRestore();
  });
});

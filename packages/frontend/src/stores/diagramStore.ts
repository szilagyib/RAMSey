import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import type { ValidationResult } from '@ramsey/engine';
import { getDiagramTypeConfig } from '../diagram-types/registry';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

/** What undo/redo restores. Selection is deliberately not part of history. */
interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  edgeCounter: number;
}

export interface DiagramStore {
  // State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeCounter: number;
  edgeCounter: number;
  diagramType: string;

  // Undo/redo (bounded snapshot stacks; see recordHistory for coalescing)
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  recordHistory: (tag?: string | null) => void;
  runInHistoryEntry: (fn: () => void) => void;
  undo: () => void;
  redo: () => void;

  // Clipboard (in-app; nodes plus the edges connecting them)
  clipboard: { nodes: Node[]; edges: Edge[] } | null;
  /** Copy the selected node(s) + internal edges. Returns false if nothing to copy. */
  copySelection: () => boolean;
  paste: () => void;
  duplicateSelection: () => void;

  // React Flow event handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node/edge CRUD
  addNode: (position: { x: number; y: number }, subType?: string) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void;
  deleteSelected: () => void;

  // Selection
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;

  // Validation
  getValidationResults: () => ValidationResult;

  // Layout helpers
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;

  // Diagram type
  setDiagramType: (type: string) => void;

  // Load diagram from API
  loadDiagram: (nodes: Node[], edges: Edge[], type: string) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 100;
/** Same-tag records inside this sliding window merge into one undo entry. */
const COALESCE_MS = 800;

// Coalescing bookkeeping lives outside the reactive state on purpose: it must
// not trigger renders and must survive between set() calls.
let historyTag: string | null = null;
let historyTagTime = 0;
let historySuppressed = false;

/** How many times the current clipboard has been pasted (drives the offset). */
let pasteCount = 0;
const PASTE_OFFSET = 32;

function takeSnapshot(state: {
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  edgeCounter: number;
}): HistorySnapshot {
  // All mutations are immutable (new arrays/objects), so holding references
  // is safe — no deep clone needed.
  return {
    nodes: state.nodes,
    edges: state.edges,
    nodeCounter: state.nodeCounter,
    edgeCounter: state.edgeCounter,
  };
}

export const useDiagramStore = create<DiagramStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  nodeCounter: 0,
  edgeCounter: 0,
  diagramType: 'markov_chain',
  undoStack: [],
  redoStack: [],
  clipboard: null,

  /**
   * Capture the CURRENT state as an undo entry — call before mutating.
   * A tag turns repeated calls into one entry while they keep arriving within
   * COALESCE_MS of each other (drags, property-edit keystrokes); null always
   * starts a fresh entry. Any new entry clears the redo stack.
   */
  recordHistory: (tag = null) => {
    if (historySuppressed) return;
    const now = Date.now();
    if (tag !== null && tag === historyTag && now - historyTagTime < COALESCE_MS) {
      historyTagTime = now; // sliding window: a continuous gesture stays one entry
      return;
    }
    historyTag = tag;
    historyTagTime = now;
    set((state) => ({
      undoStack: [...state.undoStack.slice(-(HISTORY_LIMIT - 1)), takeSnapshot(state)],
      redoStack: [],
    }));
  },

  /** Group several mutations (e.g. one AI tool call, auto-layout) into ONE undo entry. */
  runInHistoryEntry: (fn) => {
    get().recordHistory(null);
    historySuppressed = true;
    try {
      fn();
    } finally {
      historySuppressed = false;
    }
  },

  undo: () => {
    const state = get();
    const prev = state.undoStack[state.undoStack.length - 1];
    if (!prev) return;
    historyTag = null;
    set({
      ...prev,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, takeSnapshot(state)].slice(-HISTORY_LIMIT),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  redo: () => {
    const state = get();
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next) return;
    historyTag = null;
    set({
      ...next,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, takeSnapshot(state)].slice(-HISTORY_LIMIT),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  copySelection: () => {
    const { nodes, edges, selectedNodeId } = get();
    // React Flow multi-selection takes precedence; fall back to the
    // store-tracked single selection. A lone edge isn't copyable — it's
    // meaningless without its endpoints.
    let picked = nodes.filter((n) => n.selected);
    if (picked.length === 0 && selectedNodeId) {
      picked = nodes.filter((n) => n.id === selectedNodeId);
    }
    if (picked.length === 0) return false;

    const ids = new Set(picked.map((n) => n.id));
    const pickedEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    pasteCount = 0;
    set({
      clipboard: {
        nodes: picked.map((n) => ({ ...n, selected: false })),
        edges: pickedEdges.map((e) => ({ ...e, selected: false })),
      },
    });
    return true;
  },

  paste: () => {
    const { clipboard, nodes, edges, nodeCounter, edgeCounter } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;
    get().recordHistory();

    pasteCount += 1;
    const offset = PASTE_OFFSET * pasteCount;

    // Fresh counter-based ids (unique within the diagram; undo restores the
    // counters, so re-pasting after an undo can't collide either).
    const idMap = new Map<string, string>();
    clipboard.nodes.forEach((n, i) => idMap.set(n.id, `copy-${nodeCounter + i}`));

    const newNodes = clipboard.nodes.map((n) => {
      const data = { ...n.data } as Record<string, unknown>;
      // A pasted Markov state must not steal the initial-state marker.
      if (data.isInitial === true) data.isInitial = false;
      return {
        ...n,
        id: idMap.get(n.id)!,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        data,
        selected: true,
      };
    });
    const newEdges = clipboard.edges.map((e, i) => ({
      ...e,
      id: `copy-e${edgeCounter + i}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      data: { ...e.data },
      selected: false,
    }));

    set({
      nodes: [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
      edges: [...edges, ...newEdges],
      nodeCounter: nodeCounter + newNodes.length,
      edgeCounter: edgeCounter + newEdges.length,
      selectedNodeId: newNodes.length === 1 ? newNodes[0].id : null,
      selectedEdgeId: null,
    });
  },

  duplicateSelection: () => {
    if (get().copySelection()) get().paste();
  },

  onNodesChange: (changes: NodeChange[]) => {
    // Only real mutations enter history: removals always; drags once at the
    // first dragging event (the 'drag' tag coalesces the rest of the gesture).
    // Selection/dimension changes are not undoable.
    if (changes.some((c) => c.type === 'remove')) {
      get().recordHistory();
    } else if (changes.some((c) => c.type === 'position' && c.dragging)) {
      get().recordHistory('drag');
    }
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
    // Drag finished → end the coalescing window so the next drag is a new entry.
    if (changes.some((c) => c.type === 'position' && c.dragging === false)) {
      historyTag = null;
    }
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    if (changes.some((c) => c.type === 'remove')) {
      get().recordHistory();
    }
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection: Connection) => {
    const { edges, edgeCounter, diagramType } = get();
    const config = getDiagramTypeConfig(diagramType);
    if (!config) return;
    get().recordHistory();

    // Pass the source handle through as the edge subtype (e.g. an event-tree
    // header's "success"/"failure" handle decides the branch type), and keep
    // the handle ids on the edge so it stays attached to the right handle on
    // nodes with more than one.
    const newEdge = config.createEdge(
      connection.source,
      connection.target,
      edgeCounter,
      connection.sourceHandle ?? undefined,
    );
    set({
      edges: [
        ...edges,
        {
          ...newEdge,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        },
      ],
      edgeCounter: edgeCounter + 1,
    });
  },

  addNode: (position, subType) => {
    const { nodes, nodeCounter, diagramType } = get();
    const config = getDiagramTypeConfig(diagramType);
    if (!config) return;
    get().recordHistory();

    const newNode = config.createNode(position, nodeCounter, subType);
    set({
      nodes: [...nodes, newNode],
      nodeCounter: nodeCounter + 1,
    });
  },

  updateNodeData: (nodeId, data) => {
    // Tagged per node: a burst of keystrokes in the property panel is one entry.
    get().recordHistory(`node-props:${nodeId}`);
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node,
      ),
    }));
  },

  updateEdgeData: (edgeId, data) => {
    // Tagged per edge: covers property keystrokes AND control-point drags.
    get().recordHistory(`edge-props:${edgeId}`);
    set((state) => ({
      edges: state.edges.map((edge) =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data, ...data } }
          : edge,
      ),
    }));
  },

  deleteSelected: () => {
    const { nodes, edges, selectedNodeId, selectedEdgeId } = get();
    if (selectedNodeId || selectedEdgeId) get().recordHistory();

    if (selectedNodeId) {
      set({
        nodes: nodes.filter((n) => n.id !== selectedNodeId),
        edges: edges.filter(
          (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
        ),
        selectedNodeId: null,
      });
    } else if (selectedEdgeId) {
      set({
        edges: edges.filter((e) => e.id !== selectedEdgeId),
        selectedEdgeId: null,
      });
    }
  },

  selectNode: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null });
  },

  selectEdge: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, selectedEdgeId: null });
  },

  getValidationResults: () => {
    const { nodes, edges, diagramType } = get();
    const config = getDiagramTypeConfig(diagramType);
    if (!config) {
      return { valid: true, errors: [], warnings: [] };
    }
    return config.validate(nodes, edges);
  },

  setNodes: (nodes) => {
    set({ nodes });
  },

  setEdges: (edges) => {
    set({ edges });
  },

  setDiagramType: (type) => {
    set({ diagramType: type });
  },

  loadDiagram: (nodes, edges, type) => {
    // A load is a new editing context — history from the previous document
    // must not leak into it.
    historyTag = null;
    set({
      nodes,
      edges,
      diagramType: type,
      nodeCounter: nodes.length,
      edgeCounter: edges.length,
      selectedNodeId: null,
      selectedEdgeId: null,
      undoStack: [],
      redoStack: [],
    });
  },
}));

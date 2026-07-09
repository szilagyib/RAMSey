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

export interface DiagramStore {
  // State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeCounter: number;
  edgeCounter: number;
  diagramType: string;

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

export const useDiagramStore = create<DiagramStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  nodeCounter: 0,
  edgeCounter: 0,
  diagramType: 'markov_chain',

  onNodesChange: (changes: NodeChange[]) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }));
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }));
  },

  onConnect: (connection: Connection) => {
    const { edges, edgeCounter, diagramType } = get();
    const config = getDiagramTypeConfig(diagramType);
    if (!config) return;

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

    const newNode = config.createNode(position, nodeCounter, subType);
    set({
      nodes: [...nodes, newNode],
      nodeCounter: nodeCounter + 1,
    });
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node,
      ),
    }));
  },

  updateEdgeData: (edgeId, data) => {
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
    set({
      nodes,
      edges,
      diagramType: type,
      nodeCounter: nodes.length,
      edgeCounter: edges.length,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },
}));

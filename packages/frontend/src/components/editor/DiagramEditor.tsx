import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  SelectionMode,
  ViewportPortal,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDiagramStore } from '../../stores/diagramStore';
import { useEditorPrefs } from '../../stores/editorPrefs';
import { getDiagramTypeConfig } from '../../diagram-types/registry';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { Toolbar } from './Toolbar';
import { ValidationPanel } from './ValidationPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { CursorsOverlay } from './CursorsOverlay';
import { SelectionOverlay } from './SelectionOverlay';
import { GuideOverlay } from './GuideOverlay';
import { EdgeMarkers } from '../../diagram-types/shared/EdgeMarkers';
import { InlineLabelEditor } from './InlineLabelEditor';
import { computeSnap, boxOf, type Guide } from '../../lib/alignmentGuides';
import { useCollaboration } from '../../hooks/useCollaboration';

interface DiagramEditorProps {
  onNavigateBack?: () => void;
  onSave?: () => void;
  onCreateSnapshot?: () => void;
  onRename?: (name: string) => void;
  diagramName?: string;
  isSaving?: boolean;
  projectId?: string;
  diagramId?: string;
}

function DiagramEditorInner({ onNavigateBack, onSave, onCreateSnapshot, diagramName, isSaving, projectId, diagramId }: DiagramEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const diagramType = useDiagramStore((s) => s.diagramType);
  const onNodesChange = useDiagramStore((s) => s.onNodesChange);
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange);
  const onConnect = useDiagramStore((s) => s.onConnect);
  const addNode = useDiagramStore((s) => s.addNode);
  const selectNode = useDiagramStore((s) => s.selectNode);
  const selectEdge = useDiagramStore((s) => s.selectEdge);
  const selectedNodeId = useDiagramStore((s) => s.selectedNodeId);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const nudgeSelection = useDiagramStore((s) => s.nudgeSelection);

  const background = useEditorPrefs((s) => s.background);
  const minimap = useEditorPrefs((s) => s.minimap);

  const config = getDiagramTypeConfig(diagramType);
  const nodeTypes = useMemo(() => config?.nodeTypes ?? {}, [config]);
  const edgeTypes = useMemo(() => config?.edgeTypes ?? {}, [config]);
  const defaultEdgeType = config?.defaultEdgeType ?? 'default';

  // Arrowheads are owned by the edge components themselves (see EdgeMarkers):
  // directed where the notation is directed — Markov transitions, event-tree
  // branches, bow-tie pathways — and absent on fault trees and RBDs, which use
  // plain connectors per IEC 61025 / IEC 61078. Setting markerEnd here instead
  // would only reach edges drawn by hand, not ones loaded, imported or pasted.
  const defaultEdgeOptions = useMemo(
    () => ({ type: defaultEdgeType, animated: false }),
    [defaultEdgeType],
  );

  const [validationOpen, setValidationOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const { peers, cursors, selections, setCursor, setSelection } = useCollaboration({
    projectId,
    diagramId,
    diagramType,
    enabled: Boolean(projectId && diagramId),
  });

  // Broadcast the locally-selected node to collaborators.
  useEffect(() => {
    setSelection(selectedNodeId);
  }, [selectedNodeId, setSelection]);

  const lastCursorSent = useRef(0);
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const now = Date.now();
      if (now - lastCursorSent.current < 50) return; // throttle ~20/s
      lastCursorSent.current = now;
      const rf = reactFlowInstance.current;
      if (!rf) return;
      setCursor(rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [setCursor],
  );
  const onPointerLeave = useCallback(() => setCursor(null), [setCursor]);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const subType = event.dataTransfer.getData('application/ramsey-node-subtype');
      if (!subType) return;

      const rfInstance = reactFlowInstance.current;
      if (!rfInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(position, subType);
    },
    [addNode],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const inEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (inEditable) return;
        deleteSelected();
      }
      if (event.key === 'Escape') {
        clearSelection();
      }

      // Arrow-key nudging: one grid step, or a coarse step with Shift.
      const NUDGE = [16, 16] as const;
      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = deltas[event.key];
      if (dir && !inEditable) {
        event.preventDefault(); // don't scroll the pane
        const step = event.shiftKey ? 4 : 1;
        nudgeSelection(dir[0] * NUDGE[0] * step, dir[1] * NUDGE[1] * step);
      }
    },
    [deleteSelected, clearSelection, nudgeSelection],
  );

  // ---- Inline label editing ---------------------------------------------
  // Double-click a node or an edge to rename it on the canvas instead of going
  // to the property panel — labelling is the most frequent edit in these
  // diagrams (every transition carries a rate).
  const editing = useEditorPrefs((s) => s.editing);
  const startEditing = useEditorPrefs((s) => s.startEditing);
  const stopEditing = useEditorPrefs((s) => s.stopEditing);
  const updateNodeData = useDiagramStore((s) => s.updateNodeData);

  // Transient UI state, and node ids are only unique within a diagram — carrying
  // it across a remount would pop an editor open on whatever reuses that id.
  useEffect(() => stopEditing, [stopEditing]);

  const editingNode =
    editing?.kind === 'node' ? nodes.find((n) => n.id === editing.id) : undefined;

  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: { id: string }) => {
      // With a multi-select modifier held, React Flow manages the selection
      // set itself — don't collapse it to a single store selection.
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      selectNode(node.id);
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, edge: { id: string }) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // ---- Alignment guides -------------------------------------------------
  // While a node is dragged, snap it to the edges/centers of the other nodes
  // and show the lines it aligned to.
  //
  // The snap is applied by rewriting the position CHANGE before React Flow
  // applies it — not by writing the store afterwards, which RF's internal drag
  // state would just overwrite on the next frame.
  const [guides, setGuides] = useState<Guide[]>([]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Any position change carrying a position is snappable — including the
      // FINAL one of a drag (dragging: false), which otherwise overwrites the
      // snapped position with the raw pointer position.
      const move = changes.find(
        (c): c is NodeChange & {
          id: string;
          position: { x: number; y: number };
          dragging?: boolean;
        } => c.type === 'position' && !!(c as { position?: unknown }).position,
      );

      if (!move) {
        onNodesChange(changes);
        return;
      }

      const all = useDiagramStore.getState().nodes;
      const dragged = all.find((n) => n.id === move.id);
      if (dragged) {
        // Compare against every other node that isn't part of the drag.
        const others = all.filter((n) => n.id !== move.id && !n.selected).map(boxOf);
        const box = { ...boxOf(dragged), x: move.position.x, y: move.position.y };
        const { position, guides: found } = computeSnap(box, others);

        move.position = position;
        // Guides only show mid-drag; the last event ends the gesture.
        setGuides(move.dragging ? found : []);
      }

      onNodesChange(changes);
    },
    [onNodesChange],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col" onKeyDown={onKeyDown} tabIndex={0}>
      <Toolbar
        onNavigateBack={onNavigateBack}
        onSave={onSave}
        onCreateSnapshot={onCreateSnapshot}
        onValidate={() => setValidationOpen(true)}
        onAnalyze={() => setAnalysisOpen(true)}
        diagramName={diagramName}
        isSaving={isSaving}
        collaborators={peers}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="relative flex-1" ref={reactFlowWrapper} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => {
              reactFlowInstance.current = instance;
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStop={() => setGuides([])}
            onNodeDoubleClick={(_, node) => startEditing('node', node.id)}
            onEdgeDoubleClick={(_, edge) => startEditing('edge', edge.id)}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            // Snap-to-grid is deliberately OFF: alignment guides snap to the
            // real geometry of neighbouring nodes, and a grid lattice would
            // fight them (a node would jump to the grid instead of to the line
            // it just aligned with). Arrow-key nudging still moves in 16px
            // grid steps, so grid-aligned placement remains available.
            deleteKeyCode={null}
            // Drawing-app selection model: left-drag on the canvas draws a
            // rubber-band rectangle (touching an element selects it); panning
            // moves to middle/right mouse drag or Space+drag; Ctrl/Shift+click
            // adds to the selection.
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            multiSelectionKeyCode={['Control', 'Shift']}
            className="bg-surface-50"
          >
            {background !== 'none' && (
              <Background
                variant={background === 'grid' ? BackgroundVariant.Lines : BackgroundVariant.Dots}
                gap={16}
                size={1}
                color="var(--dg-canvas-dots)"
              />
            )}
            {minimap && (
              <MiniMap
                pannable
                zoomable
                // Mirror each node's custom color so the minimap is readable
                // against a recolored diagram.
                nodeColor={(n) =>
                  ((n.data as { color?: string })?.color ??
                    (n.data as { fillColor?: string })?.fillColor ??
                    '#94a3b8')
                }
                className="!bg-white dark:!bg-surface-100 !border !border-surface-200 dark:!border-surface-300"
              />
            )}
            <EdgeMarkers />
            <GuideOverlay guides={guides} />

            {/* Node label editor, positioned over the node in flow space. */}
            {editingNode && (
              <ViewportPortal>
                <div
                  className="absolute"
                  style={{
                    left: editingNode.position.x,
                    top: editingNode.position.y + (boxOf(editingNode).h - 24) / 2,
                    width: boxOf(editingNode).w,
                    zIndex: 20,
                  }}
                >
                  <InlineLabelEditor
                    value={String((editingNode.data as { label?: unknown })?.label ?? '')}
                    onCommit={(next: string) => {
                      updateNodeData(editingNode.id, { label: next });
                      stopEditing();
                    }}
                    onCancel={stopEditing}
                  />
                </div>
              </ViewportPortal>
            )}
            <SelectionOverlay selections={selections} nodes={nodes} />
            <CursorsOverlay cursors={cursors} />
          </ReactFlow>
          <ValidationPanel open={validationOpen} onClose={() => setValidationOpen(false)} />
          <AnalysisPanel open={analysisOpen} onClose={() => setAnalysisOpen(false)} projectId={projectId} diagramId={diagramId} />
        </div>
        <RightPanel />
      </div>
    </div>
  );
}

export function DiagramEditor({ onNavigateBack, onSave, onCreateSnapshot, diagramName, isSaving, projectId, diagramId }: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <DiagramEditorInner
        onNavigateBack={onNavigateBack}
        onSave={onSave}
        onCreateSnapshot={onCreateSnapshot}
        diagramName={diagramName}
        isSaving={isSaving}
        projectId={projectId}
        diagramId={diagramId}
      />
    </ReactFlowProvider>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDiagramStore } from '../../stores/diagramStore';
import { getDiagramTypeConfig } from '../../diagram-types/registry';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { Toolbar } from './Toolbar';
import { ValidationPanel } from './ValidationPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { CursorsOverlay } from './CursorsOverlay';
import { SelectionOverlay } from './SelectionOverlay';
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

  const config = getDiagramTypeConfig(diagramType);
  const nodeTypes = useMemo(() => config?.nodeTypes ?? {}, [config]);
  const edgeTypes = useMemo(() => config?.edgeTypes ?? {}, [config]);
  const defaultEdgeType = config?.defaultEdgeType ?? 'default';

  // Directed arrowheads only where the notation is directed: Markov
  // transitions, event-tree branches, bow-tie pathways. Fault trees and RBDs
  // use plain connectors per IEC 61025 / IEC 61078.
  const isDirected =
    diagramType === 'markov_chain' || diagramType === 'event_tree' || diagramType === 'bow_tie';
  const defaultEdgeOptions = useMemo(
    () => ({
      type: defaultEdgeType,
      animated: false,
      ...(isDirected
        ? { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' } }
        : {}),
    }),
    [defaultEdgeType, isDirected],
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
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
          return;
        }
        deleteSelected();
      }
      if (event.key === 'Escape') {
        clearSelection();
      }
    },
    [deleteSelected, clearSelection],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(instance) => {
              reactFlowInstance.current = instance;
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
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
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={null}
            className="bg-surface-50"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="var(--dg-canvas-dots)"
            />
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

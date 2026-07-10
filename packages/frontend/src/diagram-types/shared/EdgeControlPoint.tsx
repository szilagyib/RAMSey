import { useCallback, useRef } from 'react';
import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import { useDiagramStore } from '../../stores/diagramStore';

/**
 * Draggable shaping handle for a selected edge (drawing-app style). Drag to
 * bend/relocate the edge; double-click to reset to automatic routing.
 * Persists to edge.data.cpX/cpY via the store, so shapes save/export/sync.
 */
export function EdgeControlPoint({
  edgeId,
  x,
  y,
  active,
}: {
  edgeId: string;
  x: number;
  y: number;
  /** True when the user has already shaped this edge (filled dot). */
  active: boolean;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useDiagramStore.getState().updateEdgeData(edgeId, { cpX: pos.x, cpY: pos.y });
    },
    [edgeId, screenToFlowPosition],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      useDiagramStore.getState().updateEdgeData(edgeId, { cpX: null, cpY: null });
    },
    [edgeId],
  );

  return (
    <EdgeLabelRenderer>
      <div
        className="edge-cp nodrag nopan pointer-events-auto absolute h-3 w-3 cursor-move rounded-full border-2"
        title="Drag to shape the edge — double-click to reset"
        style={{
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          borderColor: 'var(--dg-edge-selected)',
          background: active ? 'var(--dg-edge-selected)' : 'var(--dg-label-bg)',
          zIndex: 10,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
    </EdgeLabelRenderer>
  );
}

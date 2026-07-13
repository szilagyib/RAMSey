import { EdgeLabelRenderer } from '@xyflow/react';
import { useEditorPrefs } from '../../stores/editorPrefs';
import { useDiagramStore } from '../../stores/diagramStore';
import { InlineLabelEditor } from '../../components/editor/InlineLabelEditor';

/**
 * Shared edge label chip. Theme-aware via the diagram notation palette
 * (index.css); rates/probabilities render in mono for quick scanning.
 * Pass `accent` to tint the border/text (e.g. ETA success/failure branches).
 *
 * Double-clicking the edge swaps the chip for an inline editor (all five edge
 * types get this from here — one place, no per-type wiring). The edited field
 * is the edge's `label`.
 */
export function EdgeLabel({
  edgeId,
  x,
  y,
  accent,
  children,
}: {
  edgeId: string;
  x: number;
  y: number;
  accent?: string;
  children: React.ReactNode;
}) {
  const editing = useEditorPrefs((s) => s.editing);
  const stopEditing = useEditorPrefs((s) => s.stopEditing);
  const isEditing = editing?.kind === 'edge' && editing.id === edgeId;

  const currentLabel = useDiagramStore(
    (s) => (s.edges.find((e) => e.id === edgeId)?.data as { label?: unknown })?.label,
  );

  // Nothing to show: no label text and not being edited. (Edges render this
  // unconditionally so an unlabelled edge can still be double-clicked to get
  // its first label.)
  if (!isEditing && !children) return null;

  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan pointer-events-auto absolute"
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      >
        {isEditing ? (
          <div style={{ width: 72 }}>
            <InlineLabelEditor
              value={String(currentLabel ?? '')}
              onCommit={(next) => {
                useDiagramStore.getState().updateEdgeData(edgeId, { label: next });
                stopEditing();
              }}
              onCancel={stopEditing}
            />
          </div>
        ) : (
          <div
            className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium shadow-sm select-none"
            style={{
              background: 'var(--dg-label-bg)',
              borderColor: accent ?? 'var(--dg-label-border)',
              color: accent ?? 'var(--dg-label-text)',
            }}
          >
            {children}
          </div>
        )}
      </div>
    </EdgeLabelRenderer>
  );
}

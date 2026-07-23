import { memo, useMemo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { ARROW_MARKER } from '../../shared/EdgeMarkers';
import { EdgeControlPoint } from '../../shared/EdgeControlPoint';
import {
  getControlPoint,
  quadraticPath,
  trimQuadraticAtDisc,
  type Disc,
} from '../../shared/edgeShape';
import { getEdgeColor } from '../../../lib/nodeColor';
import { useDiagramStore } from '../../../stores/diagramStore';
import type { MarkovEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Markov transition: a directed edge (arrowhead set via defaultEdgeOptions)
// labelled with its rate (λ, μ) per convention. Selecting the edge shows a
// draggable control point that bends the curve (drawing-app style).
// ---------------------------------------------------------------------------

function TransitionEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const cp = getControlPoint(data);

  // The target's circle, so a curve that would dive under it can be stopped at
  // the rim and keep its arrowhead visible (see trimQuadraticAtDisc).
  const targetNode = useDiagramStore((s) => s.nodes.find((n) => n.id === target));
  const targetDisc = useMemo((): Disc | null => {
    if (!targetNode) return null;
    const w = targetNode.measured?.width ?? targetNode.width ?? 0;
    const h = targetNode.measured?.height ?? targetNode.height ?? 0;
    if (!w || !h) return null;
    return {
      cx: targetNode.position.x + w / 2,
      cy: targetNode.position.y + h / 2,
      r: Math.min(w, h) / 2,
    };
  }, [targetNode]);

  const isSelfLoop = source === target;

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  if (isSelfLoop) {
    // A self-loop through the normal bezier collapses under the node (source ≈
    // target). Draw a fixed loop arcing above the node instead, with the
    // arrowhead returning to the top rim.
    const cx = targetDisc?.cx ?? sourceX;
    const cy = targetDisc?.cy ?? sourceY;
    const r = targetDisc?.r ?? 24;
    const rimY = cy - r * 0.83;
    edgePath =
      `M ${cx - r * 0.55},${rimY} ` +
      `C ${cx - r * 1.9},${cy - r * 2.7} ${cx + r * 1.9},${cy - r * 2.7} ${cx + r * 0.55},${rimY}`;
    labelX = cx;
    labelY = cy - r * 2.6;
  } else if (cp) {
    // Label stays on the full curve's midpoint; only the drawn path is trimmed.
    [edgePath, labelX, labelY] = quadraticPath(sourceX, sourceY, cp.x, cp.y, targetX, targetY);
    if (targetDisc) {
      edgePath =
        trimQuadraticAtDisc(sourceX, sourceY, cp.x, cp.y, targetX, targetY, targetDisc) ?? edgePath;
    }
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Bidirectional pairs (failure λ one way, repair μ back) land both label
  // chips around the same midpoint. Shift each chip toward its own target
  // along the edge tangent, plus a perpendicular nudge — both components flip
  // sign for the reverse edge (its dx/dy negate), so the pair separates.
  // A user-shaped edge follows its own curve instead, so no nudge is needed.
  const hasReverse = useDiagramStore((s) =>
    s.edges.some((e) => e.source === target && e.target === source),
  );
  let chipX = labelX;
  let chipY = labelY;
  if (!isSelfLoop && !cp && hasReverse) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    chipX += (dx / len) * 26 + (-dy / len) * 12;
    chipY += (dy / len) * 26 + (dx / len) * 12;
  }

  const edgeData = (data ?? { rate: '', probability: '', label: '' }) as MarkovEdgeData;
  const displayLabel = edgeData.label || edgeData.rate || edgeData.probability || '';
  const custom = getEdgeColor(data);
  const stroke = custom ?? (selected ? 'var(--dg-edge-selected)' : 'var(--dg-edge)');

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={ARROW_MARKER}
        style={{ stroke, strokeWidth: selected ? 2 : 1.5 }}
      />
      <EdgeLabel
        edgeId={id}
        x={chipX}
        y={chipY}
        accent={selected ? 'var(--dg-edge-selected)' : (custom ?? undefined)}
      >
        {displayLabel}
      </EdgeLabel>
      {selected && !isSelfLoop && (
        <EdgeControlPoint edgeId={id} x={cp?.x ?? labelX} y={cp?.y ?? labelY - 26} active={!!cp} />
      )}
    </>
  );
}

export const TransitionEdge = memo(TransitionEdgeComponent);

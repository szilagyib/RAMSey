import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { useDiagramStore } from '../../../stores/diagramStore';
import type { MarkovEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Markov transition: a directed edge (arrowhead set via defaultEdgeOptions)
// labelled with its rate (λ, μ) per convention.
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
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Bidirectional pairs (failure λ one way, repair μ back) land both label
  // chips around the same midpoint. Shift each chip toward its own target
  // along the edge tangent, plus a perpendicular nudge — both components flip
  // sign for the reverse edge (its dx/dy negate), so the pair separates.
  const hasReverse = useDiagramStore((s) =>
    s.edges.some((e) => e.source === target && e.target === source),
  );
  let chipX = labelX;
  let chipY = labelY;
  if (hasReverse) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    chipX += (dx / len) * 26 + (-dy / len) * 12;
    chipY += (dy / len) * 26 + (dx / len) * 12;
  }

  const edgeData = (data ?? { rate: '', probability: '', label: '' }) as MarkovEdgeData;
  const displayLabel = edgeData.label || edgeData.rate || edgeData.probability || '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? 'var(--dg-edge-selected)' : 'var(--dg-edge)',
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {displayLabel && (
        <EdgeLabel x={chipX} y={chipY} accent={selected ? 'var(--dg-edge-selected)' : undefined}>
          {displayLabel}
        </EdgeLabel>
      )}
    </>
  );
}

export const TransitionEdge = memo(TransitionEdgeComponent);

import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import type { BowTieEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Bow-tie flow: left-to-right hazard pathway (threat → barriers → top event
// → barriers → consequence); directed, arrowhead set via defaultEdgeOptions.
// ---------------------------------------------------------------------------

function FlowEdgeComponent({
  id,
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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = (data ?? { label: '' }) as BowTieEdgeData;
  const displayLabel = edgeData.label || '';

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
        <EdgeLabel x={labelX} y={labelY} accent={selected ? 'var(--dg-edge-selected)' : undefined}>
          {displayLabel}
        </EdgeLabel>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeComponent);

import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import type { EventTreeEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Event-tree branch: success (up) / failure (down), color-coded per
// convention and labelled with the branch probability.
// ---------------------------------------------------------------------------

function BranchEdgeComponent({
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

  const edgeData = (data ?? { label: '', branchType: 'success' }) as EventTreeEdgeData;
  const isSuccess = edgeData.branchType === 'success';
  const displayLabel = edgeData.label || edgeData.probability || '';
  const stroke = isSuccess ? 'var(--dg-success)' : 'var(--dg-failure)';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: selected ? 2.5 : 1.5,
        }}
      />
      {displayLabel && (
        <EdgeLabel x={labelX} y={labelY} accent={stroke}>
          {displayLabel}
        </EdgeLabel>
      )}
    </>
  );
}

export const BranchEdge = memo(BranchEdgeComponent);

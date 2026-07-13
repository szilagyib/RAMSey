import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { EdgeControlPoint } from '../../shared/EdgeControlPoint';
import { getControlPoint } from '../../shared/edgeShape';
import { getEdgeColor } from '../../../lib/nodeColor';
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
  // A user-placed control point relocates the middle segment (orthogonal
  // routing is kept).
  const cp = getControlPoint(data);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX: cp?.x,
    centerY: cp?.y,
  });

  const edgeData = (data ?? { label: '', branchType: 'success' }) as EventTreeEdgeData;
  const isSuccess = edgeData.branchType === 'success';
  const displayLabel = edgeData.label || edgeData.probability || '';
  // A user color overrides the success/failure convention for this edge.
  const stroke = getEdgeColor(data) ?? (isSuccess ? 'var(--dg-success)' : 'var(--dg-failure)');

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
              <EdgeLabel edgeId={id} x={labelX} y={labelY} accent={stroke}>
          {displayLabel}
        </EdgeLabel>
      {selected && (
        <EdgeControlPoint edgeId={id} x={cp?.x ?? labelX} y={cp?.y ?? labelY - 26} active={!!cp} />
      )}
    </>
  );
}

export const BranchEdge = memo(BranchEdgeComponent);

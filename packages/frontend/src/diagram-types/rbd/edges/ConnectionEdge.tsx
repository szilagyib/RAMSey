import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { EdgeControlPoint } from '../../shared/EdgeControlPoint';
import { getControlPoint } from '../../shared/edgeShape';
import type { RBDEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// RBD connector: orthogonal success-path wiring per IEC 61078 — plain lines,
// no arrowheads (flow is left-to-right by construction).
// ---------------------------------------------------------------------------

function ConnectionEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  // A user-placed control point relocates the middle segment while keeping
  // the orthogonal wiring per IEC 61078.
  const cp = getControlPoint(data);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 4,
    centerX: cp?.x,
    centerY: cp?.y,
  });

  const edgeData = (data ?? { label: '' }) as RBDEdgeData;
  const displayLabel = edgeData.label || '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
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
      {selected && (
        <EdgeControlPoint edgeId={id} x={cp?.x ?? labelX} y={cp?.y ?? labelY - 26} active={!!cp} />
      )}
    </>
  );
}

export const ConnectionEdge = memo(ConnectionEdgeComponent);

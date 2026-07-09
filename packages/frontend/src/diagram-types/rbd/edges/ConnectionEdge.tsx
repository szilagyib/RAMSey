import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 4,
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
    </>
  );
}

export const ConnectionEdge = memo(ConnectionEdgeComponent);

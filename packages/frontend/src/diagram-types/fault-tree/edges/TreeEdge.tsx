import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import type { FaultTreeEdgeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Fault-tree connector: orthogonal (bus-style) lines, no arrowheads — logic
// flow in a fault tree is implied by the vertical layout per IEC 61025.
// ---------------------------------------------------------------------------

function TreeEdgeComponent({
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
    borderRadius: 0,
  });

  const edgeData = (data ?? { label: '' }) as FaultTreeEdgeData;
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

export const TreeEdge = memo(TreeEdgeComponent);

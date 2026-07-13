import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { EdgeControlPoint } from '../../shared/EdgeControlPoint';
import { getControlPoint } from '../../shared/edgeShape';
import { getEdgeColor } from '../../../lib/nodeColor';
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
  // A user-placed control point relocates the middle segment while keeping
  // the orthogonal (bus-style) routing the notation requires.
  const cp = getControlPoint(data);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
    centerX: cp?.x,
    centerY: cp?.y,
  });

  const edgeData = (data ?? { label: '' }) as FaultTreeEdgeData;
  const displayLabel = edgeData.label || '';
  const custom = getEdgeColor(data);
  const stroke = custom ?? (selected ? 'var(--dg-edge-selected)' : 'var(--dg-edge)');

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke, strokeWidth: selected ? 2 : 1.5 }} />
      <EdgeLabel
        edgeId={id}
        x={labelX}
        y={labelY}
        accent={selected ? 'var(--dg-edge-selected)' : (custom ?? undefined)}
      >
        {displayLabel}
      </EdgeLabel>
      {selected && (
        <EdgeControlPoint edgeId={id} x={cp?.x ?? labelX} y={cp?.y ?? labelY - 26} active={!!cp} />
      )}
    </>
  );
}

export const TreeEdge = memo(TreeEdgeComponent);

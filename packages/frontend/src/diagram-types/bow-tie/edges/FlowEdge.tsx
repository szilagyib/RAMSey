import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { EdgeLabel } from '../../shared/EdgeLabel';
import { ARROW_MARKER } from '../../shared/EdgeMarkers';
import { EdgeControlPoint } from '../../shared/EdgeControlPoint';
import { getControlPoint } from '../../shared/edgeShape';
import { getEdgeColor } from '../../../lib/nodeColor';
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

  const edgeData = (data ?? { label: '' }) as BowTieEdgeData;
  const displayLabel = edgeData.label || '';
  const custom = getEdgeColor(data);
  const stroke = custom ?? (selected ? 'var(--dg-edge-selected)' : 'var(--dg-edge)');

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={ARROW_MARKER} style={{ stroke, strokeWidth: selected ? 2 : 1.5 }} />
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

export const FlowEdge = memo(FlowEdgeComponent);

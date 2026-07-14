import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { BowTieNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Threat node component — red rounded rectangle on the left side of the bow-tie
// ---------------------------------------------------------------------------

function ThreatNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as BowTieNodeData;

  return (
    <>
      {/* Node body */}
      <div
        className={cn(
          'flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg border-2 px-2 transition-shadow',
          'border-red-400 bg-red-900 dark:bg-red-50 text-red-100 dark:text-red-900',
          selected && 'ring-2 ring-red-300',
        )}
        style={nodeColorStyle(data)}
      >
        <span className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold select-none">
          {nodeData.label}
        </span>
      </div>

      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />
    </>
  );
}

export const ThreatNode = memo(ThreatNodeComponent);

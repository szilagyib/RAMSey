import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { EventTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Initiating Event node component
// ---------------------------------------------------------------------------

function InitiatingEventNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as EventTreeNodeData;

  return (
    <>
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />

      {/* Node body */}
      <div
        className={cn(
          'flex h-12 w-32 items-center justify-center overflow-hidden rounded-lg border-2 px-2 transition-shadow',
          'bg-red-900 dark:bg-red-50 border-orange-400',
          selected && 'ring-2 ring-orange-300',
        )}
        style={nodeColorStyle(data)}
      >
        <span
          className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold text-red-100 dark:text-red-900 select-none"
          style={nodeColorStyle(data) && { color: 'inherit' }}
        >
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

export const InitiatingEventNode = memo(InitiatingEventNodeComponent);

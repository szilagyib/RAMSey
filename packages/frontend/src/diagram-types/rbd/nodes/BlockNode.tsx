import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import type { RBDNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Block node component – rectangle with rounded corners
// ---------------------------------------------------------------------------

function BlockNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RBDNodeData;

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
          'flex h-16 w-28 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border-2 bg-white dark:bg-surface-100 px-2 py-1 transition-shadow',
          'border-blue-400',
          selected && 'ring-2 ring-blue-300',
        )}
      >
        <span className="w-full truncate text-center text-sm font-semibold text-primary-800 dark:text-primary-300 select-none">
          {nodeData.label}
        </span>

        {nodeData.failureRate && (
          <span className="w-full truncate text-center font-mono text-[11px] text-surface-500 select-none">
            {'\u03BB'}={nodeData.failureRate}
          </span>
        )}

        {nodeData.repairRate && (
          <span className="w-full truncate text-center font-mono text-[11px] text-surface-500 select-none">
            {'\u03BC'}={nodeData.repairRate}
          </span>
        )}
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

export const BlockNode = memo(BlockNodeComponent);

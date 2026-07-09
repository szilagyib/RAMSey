import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import type { EventTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Header node component
// ---------------------------------------------------------------------------

function HeaderNodeComponent({ data, selected }: NodeProps) {
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
          'flex h-12 w-32 items-center justify-center overflow-hidden border-2 px-2 transition-shadow',
          'bg-blue-900 dark:bg-blue-50 border-blue-400',
          selected && 'ring-2 ring-blue-300',
        )}
      >
        <span className="w-full truncate text-center text-sm font-semibold text-blue-100 dark:text-blue-900 select-none">
          {nodeData.label}
        </span>
      </div>

      {/* Source handle — success branch (top-right) */}
      <Handle
        id="success"
        type="source"
        position={Position.Right}
        style={{ top: '30%' }}
        className="!h-2.5 !w-2.5 !border-2 !border-green-400 !bg-white"
      />

      {/* Source handle — failure branch (bottom-right) */}
      <Handle
        id="failure"
        type="source"
        position={Position.Right}
        style={{ top: '70%' }}
        className="!h-2.5 !w-2.5 !border-2 !border-red-400 !bg-white"
      />
    </>
  );
}

export const HeaderNode = memo(HeaderNodeComponent);

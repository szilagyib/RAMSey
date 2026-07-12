import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { EventTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Consequence node component
// ---------------------------------------------------------------------------

function ConsequenceNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as EventTreeNodeData;

  // Use green for success outcomes, gray for generic/unlabeled consequences
  const hasLabel = nodeData.label && nodeData.label.trim() !== '';
  const isSuccess = hasLabel && /success|ok|safe/i.test(nodeData.label);

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
          'flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg border-2 px-2 transition-shadow',
          isSuccess
            ? 'bg-green-900 dark:bg-green-50 border-green-400'
            : 'bg-gray-50 border-gray-400',
          selected && (isSuccess ? 'ring-2 ring-green-300' : 'ring-2 ring-gray-300'),
        )}
        style={nodeColorStyle(data)}
      >
        <span
          className={cn(
            'w-full truncate text-center text-sm font-semibold select-none',
            isSuccess ? 'text-green-100 dark:text-green-900' : 'text-gray-900',
          )}
          style={nodeColorStyle(data) && { color: 'inherit' }}
        >
          {nodeData.label}
        </span>
      </div>
    </>
  );
}

export const ConsequenceNode = memo(ConsequenceNodeComponent);

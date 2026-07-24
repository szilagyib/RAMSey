import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle, nodeLabelStyle } from '../../../lib/nodeColor';
import type { EventTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Header node component
// ---------------------------------------------------------------------------

function HeaderNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as EventTreeNodeData;
  const custom = nodeColorStyle(data, 'var(--dg-blue-fill)');

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
          selected && 'ring-2 ring-primary-500',
        )}
        style={{
          backgroundColor: 'var(--dg-blue-fill)',
          borderColor: 'var(--dg-blue-stroke)',
          ...custom,
        }}
      >
        <span
          className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold select-none"
          style={nodeLabelStyle(data, 'var(--dg-blue-text)')}
        >
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

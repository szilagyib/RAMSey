import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { getNodeColor, tintFill } from '../../../lib/nodeColor';
import type { BowTieNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Top event node component — diamond (rotated square) in amber/orange,
// placed at the center of the bow-tie
// ---------------------------------------------------------------------------

function TopEventNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as BowTieNodeData;
  const customColor = getNodeColor(data);

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />

      {/* Diamond shape — rotated 45 degrees. Colors from the notation palette
          (theme-aware); raw amber utilities render dark in light mode here. */}
      <div
        className={cn(
          'absolute h-12 w-12 rotate-45 border-2 transition-shadow',
          selected && 'ring-2 ring-amber-300',
        )}
        style={{
          background: customColor ? tintFill(customColor) : 'var(--dg-intermediate-fill)',
          borderColor: customColor ?? 'var(--dg-intermediate-stroke)',
        }}
      />

      {/* Label — not rotated, sits on top of the diamond */}
      <span
        className="relative z-10 max-w-[44px] truncate text-center text-xs font-semibold leading-tight select-none"
        style={{ color: customColor ? 'var(--dg-undeveloped-text)' : 'var(--dg-intermediate-text)' }}
      >
        {nodeData.label}
      </span>

      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />
    </div>
  );
}

export const TopEventNode = memo(TopEventNodeComponent);

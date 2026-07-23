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
  const custom = nodeColorStyle(data);

  return (
    <>
      {/* Node body */}
      <div
        className={cn(
          'flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg border-2 px-2 transition-shadow',
          selected && 'ring-2 ring-primary-500',
        )}
        style={{
          backgroundColor: 'var(--dg-top-fill)',
          borderColor: 'var(--dg-top-stroke)',
          ...custom,
        }}
      >
        <span
          className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold select-none"
          style={{ color: custom?.color ?? 'var(--dg-top-text)' }}
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

export const ThreatNode = memo(ThreatNodeComponent);

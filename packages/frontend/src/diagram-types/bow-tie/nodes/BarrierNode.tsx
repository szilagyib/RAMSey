import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { BowTieNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for barrier types
// ---------------------------------------------------------------------------

const barrierTokens: Record<
  'preventive_barrier' | 'mitigative_barrier',
  { fill: string; stroke: string; text: string }
> = {
  preventive_barrier: {
    fill: 'var(--dg-blue-fill)',
    stroke: 'var(--dg-blue-stroke)',
    text: 'var(--dg-blue-text)',
  },
  mitigative_barrier: {
    fill: 'var(--dg-basic-fill)',
    stroke: 'var(--dg-basic-stroke)',
    text: 'var(--dg-basic-text)',
  },
};

// ---------------------------------------------------------------------------
// Barrier node component — tall vertical rectangle (blue or green)
// ---------------------------------------------------------------------------

function BarrierNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as BowTieNodeData;
  const kind =
    nodeData.nodeKind === 'mitigative_barrier' ? 'mitigative_barrier' : 'preventive_barrier';
  const tokens = barrierTokens[kind];
  const custom = nodeColorStyle(data);

  return (
    <>
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />

      {/* Node body — tall narrow rectangle */}
      <div
        className={cn(
          'flex h-20 w-8 items-center justify-center overflow-hidden border-2 transition-shadow',
          selected && 'ring-2 ring-primary-500',
        )}
        style={custom ?? { backgroundColor: tokens.fill, borderColor: tokens.stroke }}
      >
        <span
          className="text-[10px] font-semibold leading-tight select-none"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            color: custom?.color ?? tokens.text,
          }}
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

export const BarrierNode = memo(BarrierNodeComponent);

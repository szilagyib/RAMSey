import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import type { BowTieNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for barrier types
// ---------------------------------------------------------------------------

const barrierStyles: Record<
  'preventive_barrier' | 'mitigative_barrier',
  { bg: string; border: string; ring: string; text: string }
> = {
  preventive_barrier: {
    bg: 'bg-blue-900 dark:bg-blue-50',
    border: 'border-blue-400',
    ring: 'ring-blue-300',
    text: 'text-blue-100 dark:text-blue-900',
  },
  mitigative_barrier: {
    bg: 'bg-green-900 dark:bg-green-50',
    border: 'border-green-400',
    ring: 'ring-green-300',
    text: 'text-green-100 dark:text-green-900',
  },
};

// ---------------------------------------------------------------------------
// Barrier node component — tall vertical rectangle (blue or green)
// ---------------------------------------------------------------------------

function BarrierNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as BowTieNodeData;
  const kind =
    nodeData.nodeKind === 'mitigative_barrier'
      ? 'mitigative_barrier'
      : 'preventive_barrier';
  const style = barrierStyles[kind];

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
          style.bg,
          style.border,
          selected && `ring-2 ${style.ring}`,
        )}
      >
        <span
          className={cn(
            'text-[10px] font-semibold leading-tight select-none',
            style.text,
          )}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
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

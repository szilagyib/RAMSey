import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { MarkovNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for state types
// ---------------------------------------------------------------------------

const stateStyles: Record<
  MarkovNodeData['stateType'],
  { bg: string; border: string; ring: string; text: string }
> = {
  operational: {
    bg: 'bg-state-operational-900 dark:bg-state-operational-50',
    border: 'border-state-operational-400',
    ring: 'ring-state-operational-300',
    text: 'text-state-operational-100 dark:text-state-operational-900',
  },
  degraded: {
    bg: 'bg-state-degraded-900 dark:bg-state-degraded-50',
    border: 'border-state-degraded-400',
    ring: 'ring-state-degraded-300',
    text: 'text-state-degraded-100 dark:text-state-degraded-900',
  },
  failed: {
    bg: 'bg-state-failed-900 dark:bg-state-failed-50',
    border: 'border-state-failed-400',
    ring: 'ring-state-failed-300',
    text: 'text-state-failed-100 dark:text-state-failed-900',
  },
  absorbing: {
    bg: 'bg-state-absorbing-900 dark:bg-state-absorbing-50',
    border: 'border-state-absorbing-500',
    ring: 'ring-state-absorbing-300',
    text: 'text-state-absorbing-100 dark:text-state-absorbing-900',
  },
};

// ---------------------------------------------------------------------------
// State node component
// ---------------------------------------------------------------------------

function StateNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as MarkovNodeData;
  const style = stateStyles[nodeData.stateType] ?? stateStyles.operational;
  const isAbsorbing = nodeData.stateType === 'absorbing';
  const custom = nodeColorStyle(data);

  return (
    <>
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />

      {/* Node body. Absorbing states use the standard double-circle notation:
          an outer ring in the same stroke color around the state circle. */}
      <div
        className={cn(
          'rounded-full transition-shadow',
          isAbsorbing && cn('border-2 p-[3px]', style.border),
          selected && `ring-2 ${style.ring}`,
          nodeData.isInitial && 'ring-2 ring-offset-2 ring-primary-400',
        )}
        style={custom && isAbsorbing ? { borderColor: custom.borderColor } : undefined}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full border-2',
            style.bg,
            style.border,
          )}
          style={custom}
        >
          <span
            className={cn('text-sm font-semibold select-none', style.text)}
            style={custom ? { color: custom.color } : undefined}
          >
            {nodeData.label}
          </span>
        </div>
      </div>

      {/* Initial state indicator */}
      {nodeData.isInitial && (
        <div className="absolute -left-5 top-1/2 -translate-y-1/2">
          <svg width="14" height="14" viewBox="0 0 14 14" className="text-primary-500">
            <polygon points="0,0 14,7 0,14" fill="currentColor" />
          </svg>
        </div>
      )}

      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />
    </>
  );
}

export const StateNode = memo(StateNodeComponent);

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { MarkovNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for state types
// ---------------------------------------------------------------------------

// Theme-aware canvas colors, shared with the sidebar palette (see Sidebar.tsx)
// so a placed node matches its palette symbol in both themes.
const stateTokens: Record<
  MarkovNodeData['stateType'],
  { fill: string; stroke: string; text: string }
> = {
  operational: {
    fill: 'var(--dg-basic-fill)',
    stroke: 'var(--dg-basic-stroke)',
    text: 'var(--dg-basic-text)',
  },
  degraded: {
    fill: 'var(--dg-intermediate-fill)',
    stroke: 'var(--dg-intermediate-stroke)',
    text: 'var(--dg-intermediate-text)',
  },
  failed: {
    fill: 'var(--dg-top-fill)',
    stroke: 'var(--dg-top-stroke)',
    text: 'var(--dg-top-text)',
  },
  absorbing: {
    fill: 'var(--dg-undeveloped-fill)',
    stroke: 'var(--dg-undeveloped-stroke)',
    text: 'var(--dg-undeveloped-text)',
  },
};

// ---------------------------------------------------------------------------
// State node component
// ---------------------------------------------------------------------------

function StateNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as MarkovNodeData;
  const tokens = stateTokens[nodeData.stateType] ?? stateTokens.operational;
  const isAbsorbing = nodeData.stateType === 'absorbing';
  const custom = nodeColorStyle(data);
  const strokeColor = custom?.borderColor ?? tokens.stroke;

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
          isAbsorbing && 'border-2 p-[3px]',
          selected && 'ring-2 ring-primary-500',
        )}
        style={isAbsorbing ? { borderColor: strokeColor } : undefined}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full border-2"
          style={custom ?? { backgroundColor: tokens.fill, borderColor: tokens.stroke }}
        >
          <span
            className="text-sm font-semibold select-none"
            style={{ color: custom?.color ?? tokens.text }}
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

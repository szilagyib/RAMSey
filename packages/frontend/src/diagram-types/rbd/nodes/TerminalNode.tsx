import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { RBDNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for terminal types
// ---------------------------------------------------------------------------

const terminalTokens: Record<
  'input_terminal' | 'output_terminal',
  { fill: string; stroke: string; text: string }
> = {
  input_terminal: {
    fill: 'var(--dg-basic-fill)',
    stroke: 'var(--dg-basic-stroke)',
    text: 'var(--dg-basic-text)',
  },
  output_terminal: {
    fill: 'var(--dg-top-fill)',
    stroke: 'var(--dg-top-stroke)',
    text: 'var(--dg-top-text)',
  },
};

// ---------------------------------------------------------------------------
// Terminal node component – circle (input = green, output = red)
// ---------------------------------------------------------------------------

function TerminalNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RBDNodeData;
  const kind = nodeData.nodeKind as 'input_terminal' | 'output_terminal';
  const tokens = terminalTokens[kind] ?? terminalTokens.input_terminal;
  const custom = nodeColorStyle(data, tokens.fill);

  return (
    <>
      {/* Target handle – only for output terminal (left side) */}
      {kind === 'output_terminal' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
        />
      )}

      {/* Node body */}
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2 transition-shadow',
          selected && 'ring-2 ring-primary-500',
        )}
        style={{ backgroundColor: tokens.fill, borderColor: tokens.stroke, ...custom }}
      >
        <span
          className="text-xs font-semibold select-none"
          style={{ color: custom?.color ?? tokens.text }}
        >
          {nodeData.label}
        </span>
      </div>

      {/* Source handle – only for input terminal (right side) */}
      {kind === 'input_terminal' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
        />
      )}
    </>
  );
}

export const TerminalNode = memo(TerminalNodeComponent);

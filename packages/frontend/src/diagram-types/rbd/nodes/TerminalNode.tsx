import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle } from '../../../lib/nodeColor';
import type { RBDNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Color mapping for terminal types
// ---------------------------------------------------------------------------

const terminalStyles: Record<
  'input_terminal' | 'output_terminal',
  { bg: string; border: string; ring: string; text: string }
> = {
  input_terminal: {
    bg: 'bg-green-900 dark:bg-green-50',
    border: 'border-green-500',
    ring: 'ring-green-300',
    text: 'text-green-100 dark:text-green-900',
  },
  output_terminal: {
    bg: 'bg-red-900 dark:bg-red-50',
    border: 'border-red-500',
    ring: 'ring-red-300',
    text: 'text-red-100 dark:text-red-900',
  },
};

// ---------------------------------------------------------------------------
// Terminal node component – circle (input = green, output = red)
// ---------------------------------------------------------------------------

function TerminalNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as RBDNodeData;
  const kind = nodeData.nodeKind as 'input_terminal' | 'output_terminal';
  const style = terminalStyles[kind] ?? terminalStyles.input_terminal;

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
          style.bg,
          style.border,
          selected && `ring-2 ${style.ring}`,
        )}
        style={nodeColorStyle(data)}
      >
        <span
          className={cn('text-xs font-semibold select-none', style.text)}
          style={nodeColorStyle(data) && { color: 'inherit' }}
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

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
  const custom = nodeColorStyle(data);
  const tok = isSuccess
    ? {
        fill: 'var(--dg-basic-fill)',
        stroke: 'var(--dg-basic-stroke)',
        text: 'var(--dg-basic-text)',
      }
    : {
        fill: 'var(--dg-undeveloped-fill)',
        stroke: 'var(--dg-undeveloped-stroke)',
        text: 'var(--dg-undeveloped-text)',
      };

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
          selected && 'ring-2 ring-primary-500',
        )}
        style={custom ?? { backgroundColor: tok.fill, borderColor: tok.stroke }}
      >
        <span
          className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold select-none"
          style={{ color: custom?.color ?? tok.text }}
        >
          {nodeData.label}
        </span>
      </div>
    </>
  );
}

export const ConsequenceNode = memo(ConsequenceNodeComponent);

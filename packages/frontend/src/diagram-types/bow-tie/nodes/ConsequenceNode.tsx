import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { nodeColorStyle, nodeLabelStyle } from '../../../lib/nodeColor';
import type { BowTieNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// Consequence node component — purple/gray rounded rectangle on the right
// side of the bow-tie
// ---------------------------------------------------------------------------

function ConsequenceNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as BowTieNodeData;

  return (
    <>
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-surface-400 !bg-white"
      />

      {/* Node body — notation-palette tokens so it stays legible in dark mode
          (the raw purple utilities have no dark variant here). */}
      <div
        className={cn(
          'flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg border-2 px-2 transition-shadow',
          selected && 'ring-2 ring-primary-500',
        )}
        style={{
          background: 'var(--dg-consequence-fill)',
          borderColor: 'var(--dg-consequence-stroke)',
          color: 'var(--dg-consequence-text)',
          ...nodeColorStyle(data, 'var(--dg-consequence-fill)'),
        }}
      >
        <span
          className="line-clamp-2 w-full text-center text-sm leading-tight font-semibold select-none"
          style={nodeLabelStyle(data)}
        >
          {nodeData.label}
        </span>
      </div>
    </>
  );
}

export const ConsequenceNode = memo(ConsequenceNodeComponent);

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import { resolveTokenColors } from '../../../lib/nodeColor';
import type { FaultTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// IEC 61025 event symbols:
//   top / intermediate event → rectangle (description box)
//   basic event              → circle
//   undeveloped event        → diamond
// Colors come from the diagram notation palette in index.css (theme-aware).
// ---------------------------------------------------------------------------

const SYMBOL_SIZE = 48;

interface EventTokens {
  fill: string;
  stroke: string;
  text: string;
}

const eventTokens: Record<NonNullable<FaultTreeNodeData['eventType']>, EventTokens> = {
  basic: {
    fill: 'var(--dg-basic-fill)',
    stroke: 'var(--dg-basic-stroke)',
    text: 'var(--dg-basic-text)',
  },
  intermediate: {
    fill: 'var(--dg-intermediate-fill)',
    stroke: 'var(--dg-intermediate-stroke)',
    text: 'var(--dg-intermediate-text)',
  },
  top: {
    fill: 'var(--dg-top-fill)',
    stroke: 'var(--dg-top-stroke)',
    text: 'var(--dg-top-text)',
  },
  undeveloped: {
    fill: 'var(--dg-undeveloped-fill)',
    stroke: 'var(--dg-undeveloped-stroke)',
    text: 'var(--dg-undeveloped-text)',
  },
};

// ---------------------------------------------------------------------------
// Symbol shapes (SVG for circle/diamond; rectangles are HTML so the
// description text wraps properly like a real fault-tree description box)
// ---------------------------------------------------------------------------

function BasicEventSvg({ tokens }: { tokens: EventTokens }) {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 60 60">
      <circle cx={30} cy={30} r={26} fill={tokens.fill} stroke={tokens.stroke} strokeWidth={2.5} />
    </svg>
  );
}

function UndevelopedEventSvg({ tokens }: { tokens: EventTokens }) {
  return (
    <svg width={SYMBOL_SIZE} height={SYMBOL_SIZE} viewBox="0 0 60 60">
      <polygon
        points="30,4 56,30 30,56 4,30"
        fill={tokens.fill}
        stroke={tokens.stroke}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// EventNode component
// ---------------------------------------------------------------------------

function EventNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FaultTreeNodeData;
  const eventType = nodeData.eventType ?? 'basic';
  const tokens: EventTokens = resolveTokenColors(data, eventTokens[eventType] ?? eventTokens.basic);
  const isBox = eventType === 'top' || eventType === 'intermediate';

  const selectedGlow = selected
    ? { filter: 'drop-shadow(0 0 6px var(--dg-select-glow))' }
    : undefined;

  return (
    <div className="relative flex flex-col items-center transition-[filter]" style={selectedGlow}>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !bg-white"
        style={{ borderColor: tokens.stroke }}
      />

      {isBox ? (
        // Description box: rectangle per the standard; the TOP event gets a
        // heavier border to read as the root of the tree.
        <div
          className={cn(
            'flex h-12 w-32 items-center justify-center rounded-sm px-2 text-center',
            eventType === 'top' ? 'border-[3px]' : 'border-2',
          )}
          style={{ background: tokens.fill, borderColor: tokens.stroke }}
        >
          <span
            className="line-clamp-2 text-xs font-semibold leading-tight select-none"
            style={{ color: tokens.text }}
          >
            {nodeData.label}
          </span>
        </div>
      ) : (
        <>
          {eventType === 'undeveloped' ? (
            <UndevelopedEventSvg tokens={tokens} />
          ) : (
            <BasicEventSvg tokens={tokens} />
          )}
          <span
            className="mt-0.5 max-w-[88px] truncate text-center text-[10px] font-semibold select-none"
            style={{ color: tokens.text }}
          >
            {nodeData.label}
          </span>
        </>
      )}

      {nodeData.probability && (
        <span
          className="mt-0.5 font-mono text-[9px] font-medium select-none"
          style={{ color: tokens.text }}
        >
          P={nodeData.probability}
        </span>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !bg-white"
        style={{ borderColor: tokens.stroke }}
      />
    </div>
  );
}

export const EventNode = memo(EventNodeComponent);

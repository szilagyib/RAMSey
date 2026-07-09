import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '../../../lib/utils';
import type { FaultTreeNodeData } from '../../../types/diagram';

// ---------------------------------------------------------------------------
// IEC 61025 gate symbols. The silhouette IS the notation, so the shapes carry
// no text — except the voting (k/n) gate, whose "k/n" annotation is standard.
// Colors come from the diagram notation palette in index.css (theme-aware).
// ---------------------------------------------------------------------------

const GATE_SIZE = 48;
const FILL = 'var(--dg-gate-fill)';
const STROKE = 'var(--dg-gate-stroke)';

function GateSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg width={GATE_SIZE} height={GATE_SIZE} viewBox="0 0 60 60">
      {children}
    </svg>
  );
}

/** AND: flat bottom, semicircular cap (classic D-shape pointing up). */
function AndGateSvg() {
  return (
    <GateSvg>
      <path
        d="M 8 52 L 8 26 A 22 22 0 0 1 52 26 L 52 52 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </GateSvg>
  );
}

/** OR: pointed top, concave curved bottom. */
function OrGateSvg() {
  return (
    <GateSvg>
      <path
        d="M 8 52 C 8 30, 16 13, 30 5 C 44 13, 52 30, 52 52 C 38 43, 22 43, 8 52 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </GateSvg>
  );
}

/** XOR: OR body with a second concave arc across the input side. */
function XorGateSvg() {
  return (
    <GateSvg>
      <path
        d="M 8 48 C 8 27, 16 12, 30 4 C 44 12, 52 27, 52 48 C 38 39, 22 39, 8 48 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M 8 56 C 22 47, 38 47, 52 56"
        fill="none"
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </GateSvg>
  );
}

/** NOT: triangle with the inversion bubble on the output. */
function NotGateSvg() {
  return (
    <GateSvg>
      <circle cx={30} cy={9} r={5} fill={FILL} stroke={STROKE} strokeWidth={2.5} />
      <polygon
        points="30,15 50,52 10,52"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </GateSvg>
  );
}

/** Voting gate: OR silhouette annotated "k/n" (standard for k-out-of-n). */
function KOfNGateSvg({ k, n }: { k?: number; n?: number }) {
  return (
    <GateSvg>
      <path
        d="M 8 52 C 8 30, 16 13, 30 5 C 44 13, 52 30, 52 52 C 38 43, 22 43, 8 52 Z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <text
        x={30}
        y={32}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={700}
        fill={STROKE}
      >
        {`${k ?? '?'}/${n ?? 'n'}`}
      </text>
    </GateSvg>
  );
}

// ---------------------------------------------------------------------------
// Gate shapes lookup + captions (shown under the symbol, not inside it)
// ---------------------------------------------------------------------------

const gateShapes: Record<
  NonNullable<FaultTreeNodeData['gateType']>,
  React.FC<{ k?: number; n?: number }>
> = {
  AND: AndGateSvg,
  OR: OrGateSvg,
  NOT: NotGateSvg,
  K_OF_N: KOfNGateSvg,
  XOR: XorGateSvg,
};

const gateCaptions: Record<NonNullable<FaultTreeNodeData['gateType']>, string> = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  K_OF_N: 'VOTE',
  XOR: 'XOR',
};

// ---------------------------------------------------------------------------
// GateNode component
// ---------------------------------------------------------------------------

function GateNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FaultTreeNodeData;
  const gateType = nodeData.gateType ?? 'AND';
  const ShapeComponent = gateShapes[gateType] ?? gateShapes.AND;

  const kOfNProps =
    gateType === 'K_OF_N' ? { k: nodeData.k ?? 1, n: undefined } : {};

  return (
    <div
      className={cn('relative flex flex-col items-center transition-[filter]')}
      style={selected ? { filter: 'drop-shadow(0 0 6px var(--dg-select-glow))' } : undefined}
    >
      {/* Tree edges run parent → child: the top handle receives the edge from
          the parent event; the bottom handle feeds this gate's inputs below. */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !bg-white"
        style={{ borderColor: STROKE }}
      />

      <ShapeComponent {...kOfNProps} />

      <span
        className="mt-0.5 max-w-[80px] truncate text-center text-[9px] font-semibold uppercase tracking-wider select-none"
        style={{ color: STROKE }}
      >
        {nodeData.label || gateCaptions[gateType]}
      </span>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !bg-white"
        style={{ borderColor: STROKE }}
      />
    </div>
  );
}

export const GateNode = memo(GateNodeComponent);

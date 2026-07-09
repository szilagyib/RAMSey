import { EdgeLabelRenderer } from '@xyflow/react';

/**
 * Shared edge label chip. Theme-aware via the diagram notation palette
 * (index.css); rates/probabilities render in mono for quick scanning.
 * Pass `accent` to tint the border/text (e.g. ETA success/failure branches).
 */
export function EdgeLabel({
  x,
  y,
  accent,
  children,
}: {
  x: number;
  y: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan pointer-events-auto absolute rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium shadow-sm select-none"
        style={{
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          background: 'var(--dg-label-bg)',
          borderColor: accent ?? 'var(--dg-label-border)',
          color: accent ?? 'var(--dg-label-text)',
        }}
      >
        {children}
      </div>
    </EdgeLabelRenderer>
  );
}

import { ViewportPortal } from '@xyflow/react';
import { MousePointer2 } from 'lucide-react';

export interface RemoteCursor {
  id: string;
  name?: string;
  color?: string;
  x: number;
  y: number;
}

/**
 * Renders remote collaborators' cursors in flow coordinates. ViewportPortal
 * applies the canvas pan/zoom transform, so positioning by the flow-space
 * (x, y) keeps cursors aligned with the diagram as the viewport changes.
 */
export function CursorsOverlay({ cursors }: { cursors: RemoteCursor[] }) {
  return (
    <ViewportPortal>
      {cursors.map((c) => (
        <div
          key={c.id}
          style={{
            position: 'absolute',
            transform: `translate(${c.x}px, ${c.y}px)`,
            pointerEvents: 'none',
            zIndex: 1000,
          }}
          className="flex items-center"
        >
          <MousePointer2 className="h-4 w-4" style={{ color: c.color }} fill={c.color} />
          <span
            className="ml-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-white shadow-sm"
            style={{ backgroundColor: c.color ?? '#64748b' }}
          >
            {c.name ?? 'Anonymous'}
          </span>
        </div>
      ))}
    </ViewportPortal>
  );
}

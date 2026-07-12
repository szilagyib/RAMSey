import { ViewportPortal } from '@xyflow/react';
import type { Guide } from '../../lib/alignmentGuides';

/**
 * The snap lines shown while dragging. Rendered inside the viewport portal, so
 * the coordinates are flow coordinates and the lines track pan/zoom for free.
 */
export function GuideOverlay({ guides }: { guides: Guide[] }) {
  if (guides.length === 0) return null;

  return (
    <ViewportPortal>
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          className="pointer-events-none absolute bg-primary-500"
          style={
            g.axis === 'x'
              ? {
                  left: g.position,
                  top: g.start,
                  width: 1,
                  height: g.end - g.start,
                }
              : {
                  left: g.start,
                  top: g.position,
                  width: g.end - g.start,
                  height: 1,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}

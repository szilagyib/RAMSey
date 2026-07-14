import { useCallback, useRef } from 'react';
import { useReactFlow, useStore, useViewport, type ReactFlowState } from '@xyflow/react';
import { shallow } from 'zustand/shallow';

/**
 * Scrollbars for the canvas.
 *
 * React Flow has none — it assumes you pan by dragging. That's fine once you
 * know it, but a diagram that runs off the edge gives no hint there is anything
 * out there, and no way to reach it but guessing which way to drag. These
 * behave like ordinary scrollbars: the thumb's length is how much of the
 * diagram you can see, and its position is where you are in it.
 *
 * The scrollable extent is the diagram's bounding box unioned with wherever
 * you're currently looking, so panning off into empty space can never make the
 * thumb overrun its track.
 */

const BAR = 10; // px
const MIN_THUMB = 24; // px — still grabbable on a very large diagram
const PAD = 120; // flow units of breathing room around the diagram

/**
 * The diagram's bounding box, computed here in the selector rather than from
 * `nodeLookup` in a useMemo: React Flow mutates that Map in place, so its
 * identity never changes and a memo keyed on it would compute once — against an
 * empty map — and never again.
 */
const selector = (s: ReactFlowState) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of s.nodeLookup.values()) {
    const { x, y } = node.internals.positionAbsolute;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + (node.measured.width ?? 0));
    maxY = Math.max(maxY, y + (node.measured.height ?? 0));
  }
  return {
    paneWidth: s.width,
    paneHeight: s.height,
    count: s.nodeLookup.size,
    minX,
    minY,
    maxX,
    maxY,
  };
};

/** Union of the diagram's extent (padded) with the visible window. */
function extentOf(contentStart: number, contentEnd: number, viewStart: number, viewSize: number) {
  const start = Math.min(contentStart - PAD, viewStart);
  const end = Math.max(contentEnd + PAD, viewStart + viewSize);
  return { start, size: Math.max(end - start, viewSize, 1) };
}

export function CanvasScrollbars() {
  const { paneWidth, paneHeight, count, minX, minY, maxX, maxY } = useStore(selector, shallow);
  const { x, y, zoom } = useViewport();
  const { setViewport } = useReactFlow();
  const drag = useRef<{ axis: 'x' | 'y'; from: number; origin: number } | null>(null);

  const hasDiagram = count > 0 && Number.isFinite(minX);

  // The window onto the diagram, in flow units.
  const viewX = -x / zoom;
  const viewY = -y / zoom;
  const viewW = (paneWidth || 1) / zoom;
  const viewH = (paneHeight || 1) / zoom;

  const hx = extentOf(hasDiagram ? minX : 0, hasDiagram ? maxX : 0, viewX, viewW);
  const vy = extentOf(hasDiagram ? minY : 0, hasDiagram ? maxY : 0, viewY, viewH);

  const beginDragX = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { axis: 'x', from: e.clientX, origin: viewX };
    },
    [viewX],
  );

  const beginDragY = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { axis: 'y', from: e.clientY, origin: viewY };
    },
    [viewY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      // Pixels along the track map to flow units by the extent's scale.
      if (d.axis === 'x') {
        const moved = ((e.clientX - d.from) / Math.max(paneWidth - BAR, 1)) * hx.size;
        setViewport({ x: -(d.origin + moved) * zoom, y, zoom });
      } else {
        const moved = ((e.clientY - d.from) / Math.max(paneHeight - BAR, 1)) * vy.size;
        setViewport({ x, y: -(d.origin + moved) * zoom, zoom });
      }
    },
    [hx.size, vy.size, paneWidth, paneHeight, setViewport, x, y, zoom],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  // Nothing drawn yet: no extent to scroll, and a bare canvas needs no chrome.
  if (!hasDiagram || !paneWidth || !paneHeight) return null;

  const trackW = paneWidth - BAR;
  const trackH = paneHeight - BAR;
  const thumbW = Math.min(Math.max((viewW / hx.size) * trackW, MIN_THUMB), trackW);
  const thumbH = Math.min(Math.max((viewH / vy.size) * trackH, MIN_THUMB), trackH);
  const thumbX = Math.min(Math.max(((viewX - hx.start) / hx.size) * trackW, 0), trackW - thumbW);
  const thumbY = Math.min(Math.max(((viewY - vy.start) / vy.size) * trackH, 0), trackH - thumbH);

  const thumbClass =
    'absolute rounded-full bg-surface-400/50 transition-colors hover:bg-surface-500/70 active:bg-surface-500 cursor-grab active:cursor-grabbing';

  return (
    <>
      <div
        className="nopan absolute bottom-0 left-0 z-10"
        style={{ width: trackW, height: BAR }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          role="scrollbar"
          aria-label="Scroll canvas horizontally"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(((viewX - hx.start) / hx.size) * 100)}
          className={`${thumbClass} top-0.5`}
          style={{ left: thumbX, width: thumbW, height: BAR - 4 }}
          onPointerDown={beginDragX}
        />
      </div>

      <div
        className="nopan absolute top-0 right-0 z-10"
        style={{ width: BAR, height: trackH }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          role="scrollbar"
          aria-label="Scroll canvas vertically"
          aria-orientation="vertical"
          aria-valuenow={Math.round(((viewY - vy.start) / vy.size) * 100)}
          className={`${thumbClass} left-0.5`}
          style={{ top: thumbY, height: thumbH, width: BAR - 4 }}
          onPointerDown={beginDragY}
        />
      </div>
    </>
  );
}

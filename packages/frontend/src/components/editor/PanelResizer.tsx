import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../../lib/utils';

interface PanelResizerProps {
  /** Editor edge the panel is docked to — decides which way a drag grows it. */
  side: 'left' | 'right';
  width: number;
  /** Fed the raw new width; the store clamps it to the panel's bounds. */
  onResize: (width: number) => void;
  label: string;
}

const KEYBOARD_STEP = 16;

/**
 * Drag handle on a docked panel's inner edge. Positioned over the canvas rather
 * than placed in the flex row, so the hit area can be wider than the 1px border
 * it straddles without shifting the layout.
 *
 * The pointer is captured on press, which both keeps the drag alive outside the
 * handle and stops React Flow from seeing the move as a canvas gesture.
 */
export function PanelResizer({ side, width, onResize, label }: PanelResizerProps) {
  const origin = useRef<{ x: number; width: number } | null>(null);

  // Which way the pointer has to travel to widen the panel.
  const grow = side === 'left' ? 1 : -1;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); // no text selection while dragging
    origin.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    onResize(origin.current.width + (event.clientX - origin.current.x) * grow);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    origin.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault(); // the editor nudges the selection on arrow keys
    event.stopPropagation();
    onResize(width + direction * grow * KEYBOARD_STEP);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={cn(
        'absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none',
        'transition-colors hover:bg-primary-400/60 focus:outline-none focus-visible:bg-primary-500',
        side === 'left' ? '-right-1' : '-left-1',
      )}
    />
  );
}

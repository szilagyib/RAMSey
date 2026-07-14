/**
 * What the palette hands the canvas during a drag.
 *
 * The size travels with the drag because two things have to agree about it: the
 * preview the cursor carries, and where the node lands when you let go. If the
 * canvas guessed the size independently, a node would settle somewhere other
 * than where its preview was.
 */
export const NODE_SUBTYPE_MIME = 'application/ramsey-node-subtype';
export const NODE_SIZE_MIME = 'application/ramsey-node-size';

export interface NodeSize {
  width: number;
  height: number;
}

export function formatNodeSize(size: NodeSize): string {
  return `${size.width}x${size.height}`;
}

/** `"112x64"` → `{ width: 112, height: 64 }`; anything else → null. */
export function parseNodeSize(value: string | null | undefined): NodeSize | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height };
}

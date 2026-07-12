/**
 * User-set node colors. Stored as `node.data.color` ('#rrggbb'), so a color
 * automatically flows through undo history, JSON export/import, collab sync
 * and the AI's update_node tool.
 *
 * Rendering uses a tint: border/stroke in the picked color, translucent fill
 * on top of the canvas background — legible in light and dark, and the
 * notation silhouettes stay recognizable.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function getNodeColor(data: unknown): string | null {
  const c = (data as { color?: unknown } | null | undefined)?.color;
  return typeof c === 'string' && HEX_RE.test(c) ? c : null;
}

/** 15%-alpha fill for the picked color. */
export function tintFill(color: string): string {
  return `${color}26`;
}

/** Inline style override for div-based node bodies (null when no color). */
export function nodeColorStyle(
  data: unknown,
): { borderColor: string; background: string; color: string } | undefined {
  const c = getNodeColor(data);
  if (!c) return undefined;
  // Text switches to the neutral notation foreground: the tinted background
  // is close to the canvas color, so semantic light-on-dark text would wash out.
  return { borderColor: c, background: tintFill(c), color: 'var(--dg-undeveloped-text)' };
}

/** Preset swatches shown in the property panel. */
export const NODE_COLOR_PRESETS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
] as const;

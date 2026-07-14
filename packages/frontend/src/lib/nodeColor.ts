/**
 * User-set element colors. Stored on node/edge `data`, so they flow through
 * undo history, JSON export/import, collab sync and the AI's update tools:
 *
 *   node.data.color       — border / accent (existing; also tints the fill)
 *   node.data.fillColor   — interior fill (overrides the border tint)
 *   node.data.textColor   — label text
 *   edge.data.color       — edge stroke (label follows it)
 *
 * All values are '#rrggbb'; null/absent means "use the default notation color".
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hex(value: unknown): string | null {
  return typeof value === 'string' && HEX_RE.test(value) ? value : null;
}

/** Border/accent color (node.data.color). */
export function getNodeColor(data: unknown): string | null {
  return hex((data as { color?: unknown } | null | undefined)?.color);
}

export function getNodeFill(data: unknown): string | null {
  return hex((data as { fillColor?: unknown } | null | undefined)?.fillColor);
}

export function getNodeText(data: unknown): string | null {
  return hex((data as { textColor?: unknown } | null | undefined)?.textColor);
}

export function getEdgeColor(data: unknown): string | null {
  return hex((data as { color?: unknown } | null | undefined)?.color);
}

/** 15%-alpha tint of a color, used as the default fill when only a border is set. */
export function tintFill(color: string): string {
  return `${color}26`;
}

/**
 * Node opacity (node.data.opacity), 0–1. Null/absent means fully opaque.
 *
 * Applied to the whole node rather than to its fill, so it works the same for
 * the div-based nodes and the SVG ones (gates, events, the bow-tie diamond) —
 * and takes the border, the label and the handles with it, which is what you
 * want when you're fading a node back.
 */
export function getNodeOpacity(data: unknown): number | null {
  const value = (data as { opacity?: unknown } | null | undefined)?.opacity;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value >= 1) return null; // opaque is the default; don't write a style for it
  return Math.max(value, 0);
}

export interface ResolvedNodeColors {
  border: string | null;
  fill: string | null;
  text: string | null;
}

export function resolveNodeColors(data: unknown): ResolvedNodeColors {
  return { border: getNodeColor(data), fill: getNodeFill(data), text: getNodeText(data) };
}

export function hasCustomColor(c: ResolvedNodeColors): boolean {
  return c.border !== null || c.fill !== null || c.text !== null;
}

/**
 * Inline style override for div-based node bodies (null when nothing is set).
 * Only customized channels are written, so untouched ones keep their class
 * defaults. Text falls back to neutral when the node is recolored but no
 * explicit text color was picked (semantic light-on-dark text would wash out
 * against a custom fill).
 */
export function nodeColorStyle(data: unknown): React.CSSProperties | undefined {
  const { border, fill, text } = resolveNodeColors(data);
  if (border === null && fill === null && text === null) return undefined;

  const style: React.CSSProperties = {};
  if (border !== null) style.borderColor = border;
  if (fill !== null) style.background = fill;
  else if (border !== null) style.background = tintFill(border);
  if (text !== null) style.color = text;
  else if (border !== null || fill !== null) style.color = 'var(--dg-undeveloped-text)';
  return style;
}

/**
 * Resolve the three channels against token defaults, for SVG/token-based nodes
 * (gates, events, the bow-tie diamond) that render via {fill, stroke, text}
 * rather than a div style. Mirrors nodeColorStyle's fallback logic.
 */
export function resolveTokenColors(
  data: unknown,
  def: { fill: string; stroke: string; text: string },
): { fill: string; stroke: string; text: string } {
  const { border, fill, text } = resolveNodeColors(data);
  return {
    stroke: border ?? def.stroke,
    fill: fill ?? (border !== null ? tintFill(border) : def.fill),
    text: text ?? (border !== null || fill !== null ? 'var(--dg-undeveloped-text)' : def.text),
  };
}

/** Preset swatches shown in the property-panel color controls. */
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

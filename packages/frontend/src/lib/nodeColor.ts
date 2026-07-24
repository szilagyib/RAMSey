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
 * Fade a colour to `alpha` without needing to know its notation — these fills
 * are variously `#rrggbb`, `#rrggbbaa` (see tintFill) and `var(--dg-*)`, so
 * string surgery is not an option. Used for CSS backgrounds; SVG shapes use the
 * native `fill-opacity` attribute instead.
 */
export function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * Node opacity (node.data.opacity), 0–1. Null/absent means fully opaque.
 *
 * Applied to the FILL only. Fading the whole element took the border, the label
 * and the handles with it, so a faded node became unreadable and hard to grab;
 * shading just the fill keeps the outline and text crisp, which is what "make
 * this one recede" actually means on a diagram.
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
export function nodeColorStyle(
  data: unknown,
  /** The node's own notation fill, so opacity can fade it even when the user has
   *  picked no custom colour at all. */
  defaultFill?: string,
): React.CSSProperties | undefined {
  const { border, fill, text } = resolveNodeColors(data);
  const opacity = getNodeOpacity(data) ?? 1;
  if (border === null && fill === null && text === null && opacity >= 1) return undefined;

  const style: React.CSSProperties = {};
  if (border !== null) style.borderColor = border;

  const resolvedFill = fill ?? (border !== null ? tintFill(border) : defaultFill);
  if (resolvedFill !== undefined) style.background = withAlpha(resolvedFill, opacity);

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
): { fill: string; stroke: string; text: string; fillOpacity: number } {
  const { border, fill, text } = resolveNodeColors(data);
  return {
    stroke: border ?? def.stroke,
    fill: fill ?? (border !== null ? tintFill(border) : def.fill),
    text: text ?? (border !== null || fill !== null ? 'var(--dg-undeveloped-text)' : def.text),
    // SVG shapes fade via the fill-opacity attribute rather than a mixed colour:
    // it applies to the fill by definition, leaving stroke and label untouched.
    fillOpacity: getNodeOpacity(data) ?? 1,
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

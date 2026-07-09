// ---------------------------------------------------------------------------
// LaTeX text helpers
// ---------------------------------------------------------------------------

const ESCAPE_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/**
 * Escape a plain-text string for safe use in LaTeX. Backslash is handled first
 * (via the combined regex) so the replacements it introduces are not re-escaped.
 */
export function escapeLatex(text: string): string {
  if (!text) return '';
  return text.replace(/[\\&%$#_{}~^]/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/**
 * Wrap a value as a LaTeX math expression. Rates/probabilities are math by
 * nature (e.g. `\lambda_1`, `0.001`), so they are emitted in math mode rather
 * than escaped as text. Any surrounding `$` the user typed is stripped first.
 */
export function mathWrap(value: string): string {
  const inner = value.trim().replace(/^\$/, '').replace(/\$$/, '');
  return `$${inner}$`;
}

/**
 * Turn an arbitrary node/edge id into a TikZ-safe node name.
 * TikZ node names can't contain many punctuation chars; map them to `_`.
 */
export function sanitizeId(id: string): string {
  return `n${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

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
 * Unicode characters pdfLaTeX cannot typeset on its own, mapped to the math
 * commands that produce them.
 *
 * Greek is how rates are written in this field — the shipped Markov example
 * labels its transitions 2λ, μ and β — and a raw λ aborts the build with
 * "Unicode character λ (U+03BB) not set up for use with LaTeX". That is not a
 * cosmetic problem: no document comes out at all.
 */
const UNICODE_MATH: Record<string, string> = {
  α: '\\alpha',
  β: '\\beta',
  γ: '\\gamma',
  δ: '\\delta',
  ε: '\\epsilon',
  ζ: '\\zeta',
  η: '\\eta',
  θ: '\\theta',
  ι: '\\iota',
  κ: '\\kappa',
  λ: '\\lambda',
  μ: '\\mu',
  ν: '\\nu',
  ξ: '\\xi',
  π: '\\pi',
  ρ: '\\rho',
  σ: '\\sigma',
  τ: '\\tau',
  υ: '\\upsilon',
  φ: '\\phi',
  χ: '\\chi',
  ψ: '\\psi',
  ω: '\\omega',
  // Only the capitals LaTeX has commands for; the rest are Latin lookalikes.
  Γ: '\\Gamma',
  Δ: '\\Delta',
  Θ: '\\Theta',
  Λ: '\\Lambda',
  Ξ: '\\Xi',
  Π: '\\Pi',
  Σ: '\\Sigma',
  Υ: '\\Upsilon',
  Φ: '\\Phi',
  Ψ: '\\Psi',
  Ω: '\\Omega',
  '≤': '\\leq',
  '≥': '\\geq',
  '≠': '\\neq',
  '≈': '\\approx',
  '×': '\\times',
  '÷': '\\div',
  '±': '\\pm',
  '∞': '\\infty',
  '·': '\\cdot',
  '→': '\\to',
  '←': '\\gets',
};

const UNICODE_MATH_RE = new RegExp(`[${Object.keys(UNICODE_MATH).join('')}]`, 'g');

/**
 * Escape a plain-text string for safe use in LaTeX. Backslash is handled first
 * (via the combined regex) so the replacements it introduces are not re-escaped;
 * the math substitution runs last so the `$` it adds are ours, not the user's.
 */
export function escapeLatex(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\\&%$#_{}~^]/g, (ch) => ESCAPE_MAP[ch] ?? ch)
    .replace(UNICODE_MATH_RE, (ch) => `$${UNICODE_MATH[ch]}$`);
}

/**
 * Wrap a value as a LaTeX math expression. Rates/probabilities are math by
 * nature (e.g. `\lambda_1`, `0.001`), so they are emitted in math mode rather
 * than escaped as text. Any surrounding `$` the user typed is stripped first.
 */
export function mathWrap(value: string): string {
  const inner = value
    .trim()
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    // Already inside math mode, so the command goes in bare — wrapping it again
    // would close and reopen the math around every letter.
    .replace(UNICODE_MATH_RE, (ch) => UNICODE_MATH[ch]);
  return `$${inner}$`;
}

/**
 * Turn an arbitrary node/edge id into a TikZ-safe node name.
 * TikZ node names can't contain many punctuation chars; map them to `_`.
 */
export function sanitizeId(id: string): string {
  return `n${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

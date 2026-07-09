// ---------------------------------------------------------------------------
// Standalone LaTeX document wrapper
// ---------------------------------------------------------------------------

export interface DocumentOptions {
  /** Include TikZ + the standard library set. */
  tikz?: boolean;
  /** Extra packages to load (e.g. 'booktabs'). */
  packages?: string[];
}

const TIKZ_LIBRARIES = [
  'arrows.meta',
  'positioning',
  'shapes.geometric',
  'shapes.gates.logic.US',
  'calc',
  'automata',
];

/**
 * Wrap a body (a tikzpicture or a table environment) in a compilable
 * `standalone` document. The result pastes into Overleaf and builds as-is.
 */
export function wrapDocument(body: string, opts: DocumentOptions = {}): string {
  const lines: string[] = ['\\documentclass[border=10pt]{standalone}'];

  if (opts.tikz) {
    lines.push('\\usepackage{tikz}');
    lines.push(`\\usetikzlibrary{${TIKZ_LIBRARIES.join(',')}}`);
  }
  for (const pkg of opts.packages ?? []) {
    lines.push(`\\usepackage{${pkg}}`);
  }

  lines.push('\\begin{document}', body, '\\end{document}', '');
  return lines.join('\n');
}

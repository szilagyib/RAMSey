import type { FMEARow } from '../../types/diagram';
import { escapeLatex } from './latex';

const HEADERS = ['Item', 'Function', 'Failure Mode', 'Effect', 'S', 'O', 'D', 'RPN', 'Actions'];

// Text columns get fixed widths (p{}) so long cells wrap; S/O/D/RPN stay centered.
const COLSPEC = 'p{2cm}p{2cm}p{2.4cm}p{2.4cm}cccc p{2.4cm}';

function rowCells(r: FMEARow): string {
  return [
    escapeLatex(r.item),
    escapeLatex(r.function),
    escapeLatex(r.failureMode),
    escapeLatex(r.effect),
    String(r.severity),
    String(r.occurrence),
    String(r.detection),
    String(r.rpn),
    escapeLatex(r.actions),
  ].join(' & ');
}

/** Render FMEA rows as a booktabs tabular. */
export function fmeaToTable(rows: FMEARow[]): string {
  const lines: string[] = [
    `\\begin{tabular}{${COLSPEC}}`,
    '\\toprule',
    `${HEADERS.join(' & ')} \\\\`,
    '\\midrule',
  ];
  for (const r of rows) {
    lines.push(`${rowCells(r)} \\\\`);
  }
  lines.push('\\bottomrule', '\\end{tabular}');
  return lines.join('\n');
}

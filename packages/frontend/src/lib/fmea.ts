import type { FMEARow } from '../types/diagram';

/**
 * RPN risk banding.
 *
 * RPN = severity × occurrence × detection, so it runs 1–1000. The band
 * boundaries are a team convention, not a standard — AIAG-VDA deliberately
 * replaced RPN thresholds with Action Priority because equal RPNs can carry very
 * different risk (a severity-10 item and a detection-10 item can tie). They stay
 * configurable for that reason, and should be read as "look here first" rather
 * than as an authoritative cutoff.
 */
export interface RpnThresholds {
  /** RPN >= medium is amber. */
  medium: number;
  /** RPN >= high is red (takes precedence over medium). */
  high: number;
}

export const DEFAULT_RPN_THRESHOLDS: RpnThresholds = { medium: 100, high: 200 };

export type RpnBand = 'low' | 'medium' | 'high';

export function rpnBand(rpn: number, thresholds: RpnThresholds): RpnBand {
  if (rpn >= thresholds.high) return 'high';
  if (rpn >= thresholds.medium) return 'medium';
  return 'low';
}

/** Keep the pair ordered and in range whichever field the user just edited. */
export function normalizeThresholds(next: RpnThresholds): RpnThresholds {
  const medium = Math.min(Math.max(Math.round(next.medium) || 1, 1), 1000);
  const high = Math.min(Math.max(Math.round(next.high) || 1, medium), 1000);
  return { medium, high };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'Item',
  'Function',
  'Failure Mode',
  'Effect',
  'Severity',
  'Occurrence',
  'Detection',
  'RPN',
  'Actions',
] as const;

/** RFC 4180: quote every field, doubling any embedded quote. */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * FMEA worksheets are worked on in spreadsheets, so CSV is the format that
 * actually gets used — LaTeX covers the report, this covers the working copy.
 */
export function fmeaToCsv(rows: FMEARow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.item,
        row.function,
        row.failureMode,
        row.effect,
        row.severity,
        row.occurrence,
        row.detection,
        row.rpn,
        row.actions,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // Trailing newline: POSIX tools and Excel both prefer it.
  return `${lines.join('\r\n')}\r\n`;
}

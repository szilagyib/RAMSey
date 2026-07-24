import { useCallback, useMemo, useState } from 'react';
import { Trash2, Undo2, Redo2, ArrowDownWideNarrow, Download, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFMEAStore } from '../../stores/fmeaStore';
import { downloadFmeaCsv } from '../../lib/exportUtils';
import { rpnBand } from '../../lib/fmea';
import type { FMEARow } from '../../types/diagram';

const COLUMN_HEADERS = [
  'Item',
  'Function',
  'Failure Mode',
  'Effect',
  'Severity',
  'Occurrence',
  'Detection',
  'RPN',
  'Actions',
  '',
] as const;

/** Band colours that read on both themes (the old pairs inverted in dark mode). */
const RPN_BAND_CLASS = {
  high: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'text-surface-600',
} as const;

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/15'
          : 'text-surface-500 hover:bg-surface-100 hover:text-surface-700',
        // Muted but still legible when disabled, so it stays distinguishable
        // from an active control without vanishing.
        'disabled:cursor-default disabled:text-surface-400 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/** Commits on blur/Enter so a half-typed number never re-bands the table. */
function ThresholdInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  return (
    <input
      type="number"
      min={1}
      max={1000}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(Number(draft))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="w-14 rounded border border-surface-300 bg-white px-1 py-0.5 text-xs text-surface-900 focus:border-primary-500 focus:outline-none dark:bg-surface-100"
    />
  );
}

/**
 * Table-based FMEA editor. Renders an editable HTML table where each row
 * corresponds to an FMEARow in the store.
 */
export function FMEAEditor() {
  const rows = useFMEAStore((s) => s.rows);
  const selectedRowId = useFMEAStore((s) => s.selectedRowId);
  const addRow = useFMEAStore((s) => s.addRow);
  const updateRow = useFMEAStore((s) => s.updateRow);
  const deleteRow = useFMEAStore((s) => s.deleteRow);
  const selectRow = useFMEAStore((s) => s.selectRow);
  const undo = useFMEAStore((s) => s.undo);
  const redo = useFMEAStore((s) => s.redo);
  const canUndo = useFMEAStore((s) => s.undoStack.length > 0);
  const canRedo = useFMEAStore((s) => s.redoStack.length > 0);
  const thresholds = useFMEAStore((s) => s.rpnThresholds);
  const setRpnThresholds = useFMEAStore((s) => s.setRpnThresholds);

  // View-only: sorting and filtering never reorder or drop the stored rows, so
  // the worksheet order the team agreed on survives being triaged by risk.
  const [sortByRpn, setSortByRpn] = useState(false);
  const [highRiskOnly, setHighRiskOnly] = useState(false);

  const visibleRows = useMemo(() => {
    const filtered = highRiskOnly
      ? rows.filter((r) => rpnBand(r.rpn, thresholds) === 'high')
      : rows;
    return sortByRpn ? [...filtered].sort((a, b) => b.rpn - a.rpn) : filtered;
  }, [rows, sortByRpn, highRiskOnly, thresholds]);

  const hiddenCount = rows.length - visibleRows.length;

  const handleTextChange = useCallback(
    (
      id: string,
      field: keyof Omit<FMEARow, 'id' | 'rpn' | 'severity' | 'occurrence' | 'detection'>,
      value: string,
    ) => {
      updateRow(id, { [field]: value });
    },
    [updateRow],
  );

  const handleScoreChange = useCallback(
    (id: string, field: 'severity' | 'occurrence' | 'detection', value: string) => {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        updateRow(id, { [field]: Math.min(10, Math.max(1, parsed)) });
      }
    },
    [updateRow],
  );

  return (
    <div className={cn('flex flex-col gap-4 p-4 h-full overflow-auto')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">FMEA Table</h2>

        <div className="flex flex-wrap items-center gap-1">
          <IconButton label="Undo" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>

          <span className="mx-1 h-5 w-px bg-surface-200" />

          <IconButton
            label="Sort by RPN (highest first)"
            onClick={() => setSortByRpn((v) => !v)}
            active={sortByRpn}
          >
            <ArrowDownWideNarrow className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={`Show only high risk (RPN ≥ ${thresholds.high})`}
            onClick={() => setHighRiskOnly((v) => !v)}
            active={highRiskOnly}
          >
            <Filter className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Export as CSV"
            onClick={() => downloadFmeaCsv(rows)}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" />
          </IconButton>

          <span className="mx-1 h-5 w-px bg-surface-200" />

          {/* Band boundaries are a team convention, so they're editable rather
              than baked in — see rpnBand. */}
          <label className="flex items-center gap-1 text-xs text-surface-500">
            Amber ≥
            <ThresholdInput
              value={thresholds.medium}
              onCommit={(medium) => setRpnThresholds({ ...thresholds, medium })}
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-surface-500">
            Red ≥
            <ThresholdInput
              value={thresholds.high}
              onCommit={(high) => setRpnThresholds({ ...thresholds, high })}
            />
          </label>

          <button
            type="button"
            onClick={addRow}
            className={cn(
              'ml-1 rounded-md px-3 py-1.5 text-sm font-medium',
              'bg-primary-600 text-white hover:bg-primary-700',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
            )}
          >
            Add Row
          </button>
        </div>
      </div>

      {hiddenCount > 0 && (
        <p className="-mt-2 text-xs text-surface-500">
          {hiddenCount} row{hiddenCount === 1 ? '' : 's'} hidden by the high-risk filter.
        </p>
      )}

      <div
        className={cn(
          'overflow-x-auto border border-surface-200 dark:border-surface-300 rounded-md',
        )}
      >
        <table className={cn('w-full border-collapse text-sm')}>
          <thead>
            <tr className={cn('bg-surface-100')}>
              {COLUMN_HEADERS.map((header) => (
                <th
                  key={header || 'actions-col'}
                  className={cn(
                    'border border-surface-200 dark:border-surface-300 px-3 py-2 text-left font-medium text-surface-700',
                    header === '' && 'w-10',
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMN_HEADERS.length}
                  className={cn(
                    'border border-surface-200 dark:border-surface-300 px-3 py-6 text-center text-surface-400',
                  )}
                >
                  No rows yet. Click &quot;Add Row&quot; to start.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => selectRow(row.id)}
                className={cn(
                  'cursor-pointer transition-colors',
                  selectedRowId === row.id
                    ? 'bg-primary-100 dark:bg-primary-900/40'
                    : 'hover:bg-surface-100',
                )}
              >
                {/* Item */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.item}
                    onChange={(e) => handleTextChange(row.id, 'item', e.target.value)}
                    className={cn(
                      'w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                    placeholder="Item"
                  />
                </td>

                {/* Function */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.function}
                    onChange={(e) => handleTextChange(row.id, 'function', e.target.value)}
                    className={cn(
                      'w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                    placeholder="Function"
                  />
                </td>

                {/* Failure Mode */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.failureMode}
                    onChange={(e) => handleTextChange(row.id, 'failureMode', e.target.value)}
                    className={cn(
                      'w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                    placeholder="Failure Mode"
                  />
                </td>

                {/* Effect */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.effect}
                    onChange={(e) => handleTextChange(row.id, 'effect', e.target.value)}
                    className={cn(
                      'w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                    placeholder="Effect"
                  />
                </td>

                {/* Severity */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={row.severity}
                    onChange={(e) => handleScoreChange(row.id, 'severity', e.target.value)}
                    className={cn(
                      'w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                  />
                </td>

                {/* Occurrence */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={row.occurrence}
                    onChange={(e) => handleScoreChange(row.id, 'occurrence', e.target.value)}
                    className={cn(
                      'w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                  />
                </td>

                {/* Detection */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={row.detection}
                    onChange={(e) => handleScoreChange(row.id, 'detection', e.target.value)}
                    className={cn(
                      'w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                  />
                </td>

                {/* RPN (read-only, auto-computed) */}
                <td
                  className={cn(
                    'border border-surface-200 px-3 py-1 text-center font-semibold dark:border-surface-300',
                    RPN_BAND_CLASS[rpnBand(row.rpn, thresholds)],
                  )}
                  title={`Severity ${row.severity} x Occurrence ${row.occurrence} x Detection ${row.detection}`}
                >
                  {row.rpn}
                </td>

                {/* Actions */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.actions}
                    onChange={(e) => handleTextChange(row.id, 'actions', e.target.value)}
                    className={cn(
                      'w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded',
                    )}
                    placeholder="Actions"
                  />
                </td>

                {/* Delete button */}
                <td
                  className={cn(
                    'border border-surface-200 dark:border-surface-300 px-1 py-1 text-center',
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRow(row.id);
                    }}
                    className={cn(
                      'rounded p-1 text-surface-400 transition-colors',
                      'hover:bg-surface-100 hover:text-red-500',
                      'focus:outline-none focus:ring-1 focus:ring-red-400',
                    )}
                    title="Delete row"
                    aria-label="Delete row"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

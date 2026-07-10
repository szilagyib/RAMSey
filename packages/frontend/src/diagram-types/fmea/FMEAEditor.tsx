import { useCallback } from 'react';
import { cn } from '../../lib/utils';
import { useFMEAStore } from '../../stores/fmeaStore';
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

  const handleTextChange = useCallback(
    (id: string, field: keyof Omit<FMEARow, 'id' | 'rpn' | 'severity' | 'occurrence' | 'detection'>, value: string) => {
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
      <div className={cn('flex items-center justify-between')}>
        <h2 className={cn('text-lg font-semibold')}>FMEA Table</h2>
        <button
          type="button"
          onClick={addRow}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md',
            'bg-blue-600 text-white hover:bg-blue-700',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          )}
        >
          Add Row
        </button>
      </div>

      <div className={cn('overflow-x-auto border border-surface-200 dark:border-surface-300 rounded-md')}>
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
                  className={cn('border border-surface-200 dark:border-surface-300 px-3 py-6 text-center text-surface-400')}
                >
                  No rows yet. Click &quot;Add Row&quot; to start.
                </td>
              </tr>
            )}
            {rows.map((row) => (
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
                    className={cn('w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
                    placeholder="Item"
                  />
                </td>

                {/* Function */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.function}
                    onChange={(e) => handleTextChange(row.id, 'function', e.target.value)}
                    className={cn('w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
                    placeholder="Function"
                  />
                </td>

                {/* Failure Mode */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.failureMode}
                    onChange={(e) => handleTextChange(row.id, 'failureMode', e.target.value)}
                    className={cn('w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
                    placeholder="Failure Mode"
                  />
                </td>

                {/* Effect */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.effect}
                    onChange={(e) => handleTextChange(row.id, 'effect', e.target.value)}
                    className={cn('w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
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
                    className={cn('w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
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
                    className={cn('w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
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
                    className={cn('w-16 px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 text-center focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
                  />
                </td>

                {/* RPN (read-only, auto-computed) */}
                <td
                  className={cn(
                    'border border-surface-200 dark:border-surface-300 px-3 py-1 text-center font-semibold',
                    row.rpn >= 200 && 'bg-red-900 dark:bg-red-100 text-red-500 dark:text-red-700',
                    row.rpn >= 100 && row.rpn < 200 && 'bg-amber-900 dark:bg-amber-100 text-amber-500 dark:text-amber-700',
                    row.rpn < 100 && 'text-green-500 dark:text-green-700',
                  )}
                >
                  {row.rpn}
                </td>

                {/* Actions */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1')}>
                  <input
                    type="text"
                    value={row.actions}
                    onChange={(e) => handleTextChange(row.id, 'actions', e.target.value)}
                    className={cn('w-full px-2 py-1 border-0 bg-transparent text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 rounded')}
                    placeholder="Actions"
                  />
                </td>

                {/* Delete button */}
                <td className={cn('border border-surface-200 dark:border-surface-300 px-1 py-1 text-center')}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRow(row.id);
                    }}
                    className={cn(
                      'px-2 py-1 text-xs font-medium rounded',
                      'text-red-500 dark:text-red-700 hover:bg-red-900 dark:hover:bg-red-100',
                      'focus:outline-none focus:ring-1 focus:ring-red-400',
                    )}
                    title="Delete row"
                  >
                    Delete
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

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, error, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'h-9 w-full rounded-md border border-surface-300 dark:border-surface-400 bg-white dark:bg-surface-100/60 px-3 text-sm',
            'text-surface-900',
            'transition-colors duration-150',
            'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50',
            'disabled:cursor-not-allowed disabled:bg-surface-100 disabled:opacity-60',
            error &&
              'border-state-failed-500 focus:border-state-failed-500 focus:ring-state-failed-500',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-state-failed-600">{error}</span>}
      </div>
    );
  },
);

Select.displayName = 'Select';

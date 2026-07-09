import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-9 w-full rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-100/60 px-3 text-sm',
            'text-surface-900 dark:text-surface-900 placeholder:text-surface-400',
            'transition-colors duration-150',
            'focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50',
            'disabled:cursor-not-allowed disabled:bg-surface-100 disabled:opacity-60',
            error && 'border-state-failed-500 focus:border-state-failed-500 focus:ring-state-failed-500',
            className,
          )}
          {...props}
        />
        {error && (
          <span className="text-xs text-state-failed-600">{error}</span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

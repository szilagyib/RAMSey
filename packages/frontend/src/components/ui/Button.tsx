import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Variant and size definitions
// ---------------------------------------------------------------------------

const variantClasses = {
  default:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm',
  outline:
    'border border-surface-300 bg-white dark:bg-transparent text-surface-700 dark:text-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-200/40 active:bg-surface-100',
  ghost:
    'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-200/50 active:bg-surface-200',
  destructive:
    'bg-state-failed-600 text-white hover:bg-state-failed-700 active:bg-state-failed-800 shadow-sm',
} as const;

const sizeClasses = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-9 px-3.5 text-sm gap-1.5',
  lg: 'h-10 px-5 text-sm gap-2',
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium cursor-pointer',
          'transition-all duration-150 active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-level error boundary: catches render/lifecycle crashes so a bug shows a
 * recoverable screen instead of a blank page, and reports them to Sentry
 * (a no-op when no DSN is configured).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error);
    // Also surface it in the console for local debugging.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-8 text-center shadow-sm">
          <img src="/favicon.svg" alt="RAMSey" className="mx-auto mb-4 h-12 w-12" />
          <h1 className="mb-2 text-xl font-semibold text-surface-900">Something went wrong</h1>
          <p className="mb-6 text-sm text-surface-500">
            The app hit an unexpected error. Reloading usually fixes it; your saved work is safe.
          </p>
          <button
            onClick={this.handleReload}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

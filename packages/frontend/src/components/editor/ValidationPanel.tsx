import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, X, XCircle } from 'lucide-react';
import { useDiagramStore } from '../../stores/diagramStore';
import { cn } from '../../lib/utils';

interface ValidationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ValidationPanel({ open, onClose }: ValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const nodes = useDiagramStore((s) => s.nodes);
  const getValidationResults = useDiagramStore((s) => s.getValidationResults);

  if (!open) return null;

  const result = getValidationResults();
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  if (result.valid && warningCount === 0) {
    return (
      <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-md border border-state-operational-200 bg-white dark:bg-surface-100 px-3 py-2 text-xs text-state-operational-700 shadow-md">
        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        <span>
          {nodes.length === 0 ? 'No nodes to validate.' : 'Diagram is valid — no issues found.'}
        </span>
        <button
          onClick={onClose}
          className="ml-1 rounded p-0.5 text-state-operational-400 hover:text-state-operational-700 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 w-72 rounded-md border border-surface-200 dark:border-surface-400 bg-white dark:bg-surface-100 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex flex-1 items-center gap-2 text-xs font-medium text-left"
        >
          {errorCount > 0 ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-state-failed-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-state-degraded-500" />
          )}
          <span className="text-surface-700">
            {errorCount} error{errorCount !== 1 ? 's' : ''}, {warningCount} warning
            {warningCount !== 1 ? 's' : ''}
          </span>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-surface-400" />
          )}
        </button>
        <button
          onClick={onClose}
          className="ml-2 rounded p-0.5 text-surface-500 hover:text-surface-600 transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expandable list */}
      {expanded && (
        <div className="max-h-48 overflow-y-auto border-t border-surface-100 dark:border-surface-300 px-3 py-2">
          {result.errors.map((err, i) => (
            <div
              key={`err-${i}`}
              className={cn('flex items-start gap-2 py-1 text-xs', 'text-state-failed-700')}
            >
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-state-failed-400" />
              <span>{err.message}</span>
            </div>
          ))}
          {result.warnings.map((warn, i) => (
            <div
              key={`warn-${i}`}
              className={cn('flex items-start gap-2 py-1 text-xs', 'text-state-degraded-700')}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-state-degraded-400" />
              <span>{warn.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

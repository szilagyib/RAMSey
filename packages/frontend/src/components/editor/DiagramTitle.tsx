import { useState } from 'react';
import { InlineLabelEditor } from './InlineLabelEditor';
import { cn } from '../../lib/utils';

interface DiagramTitleProps {
  /** Absent until the diagram has loaded. */
  name?: string;
  onRename: (name: string) => void;
}

/**
 * The diagram name in the editor header. Click it to rename in place — until
 * now the name was fixed at creation with no way to change it.
 *
 * Reuses the canvas label editor, which already commits on Enter/blur, cancels
 * on Escape, and keeps its keystrokes away from the editor shortcuts.
 */
export function DiagramTitle({ name, onRename }: DiagramTitleProps) {
  const [editing, setEditing] = useState(false);

  if (!name) return null;

  if (editing) {
    return (
      <InlineLabelEditor
        value={name}
        // A blank name would leave the header empty and the diagram unfindable,
        // so an empty commit discards instead.
        onCommit={(next) => {
          if (next) onRename(next);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
        className={cn(
          'mr-2 w-40 rounded border border-primary-500 px-1 text-xs outline-none',
          'bg-white text-surface-900 dark:bg-surface-100',
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename diagram"
      className={cn(
        'mr-2 max-w-40 truncate rounded px-1 py-0.5 text-xs font-medium',
        'text-surface-500 transition-colors',
        'hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-200',
      )}
    >
      {name}
    </button>
  );
}

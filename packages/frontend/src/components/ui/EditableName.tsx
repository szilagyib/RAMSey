import { useState, useRef, useCallback, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EditableNameProps {
  value: string;
  onCommit: (newName: string) => void;
  className?: string;
}

/**
 * Inline-editable text that looks like a label until clicked.
 * Commits on Enter or blur; reverts on Escape.
 */
export function EditableName({ value, onCommit, className }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: re-sync the draft when the committed value prop changes
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }, [draft, value, onCommit]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className={cn(
          'max-w-48 rounded border border-primary-300 bg-white px-1.5 py-0.5 text-xs font-medium text-surface-700 outline-none focus:ring-1 focus:ring-primary-400',
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename"
      className={cn(
        'group flex max-w-48 items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-700',
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Pencil className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

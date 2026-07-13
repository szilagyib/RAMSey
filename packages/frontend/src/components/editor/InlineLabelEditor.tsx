import { useEffect, useRef, useState } from 'react';

/**
 * In-place label editor. Rendered on top of the element being edited; commits
 * on Enter or blur, cancels on Escape. Labelling is the most frequent edit in
 * these diagrams (every transition has a rate), so it shouldn't require a trip
 * to the property panel.
 */
export function InlineLabelEditor({
  value,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Stop the canvas from seeing these keys (delete/arrows/undo shortcuts).
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      // Keep React Flow from starting a drag/pan from inside the field.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        'nodrag nopan w-full rounded border border-primary-500 bg-white px-1 text-center text-sm text-surface-900 outline-none dark:bg-surface-100'
      }
    />
  );
}

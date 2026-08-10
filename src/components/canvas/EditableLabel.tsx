import { memo, useEffect, useRef, useState } from 'react';

interface EditableLabelProps {
  /** Initial value shown in the input (e.g. current label / event). */
  value: string;
  /** Placeholder shown when there is no value yet (e.g. "event name"). */
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Called with the new value when the user commits (Enter or blur). */
  onCommit: (value: string) => void;
  /** Called when editing should end without committing (Escape). */
  onCancel: () => void;
}

/**
 * A small self-contained inline editor used by both state nodes and
 * transition edges. Mounts an auto-focused <input> that commits on Enter or
 * blur and cancels on Escape.
 */
export const EditableLabel = memo(function EditableLabel({
  value,
  placeholder = '',
  className = '',
  inputClassName = '',
  onCommit,
  onCancel,
}: EditableLabelProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(draft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className={inputClassName || className}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onCommit(draft)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
});

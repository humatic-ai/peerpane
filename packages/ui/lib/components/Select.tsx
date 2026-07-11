import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../utils';

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
  /** Trigger width; default full */
  triggerClassName?: string;
};

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className,
  theme = 'light',
  triggerClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find(o => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const isDark = theme === 'dark';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setOpen(prev => !prev)}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-sm outline-none transition-[color,box-shadow]',
          'focus-visible:border-indigo-500 focus-visible:ring-[3px] focus-visible:ring-indigo-500/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isDark ? 'border-slate-600 text-gray-200' : 'border-gray-200 text-gray-800',
          triggerClassName,
        )}>
        <span className={cn('truncate', !selected && (isDark ? 'text-gray-500' : 'text-gray-400'))}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border py-1 shadow-lg',
            isDark ? 'border-slate-600 bg-slate-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900',
          )}>
          {options.map(option => {
            const isSelected = option.value === value;
            return (
              <li key={option.value || '__empty__'} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    close();
                  }}
                  className={cn(
                    'flex w-full items-center px-3 py-2 text-left text-sm transition-colors',
                    option.disabled && 'cursor-not-allowed opacity-40',
                    isSelected
                      ? isDark
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-indigo-50 text-indigo-700'
                      : isDark
                        ? 'hover:bg-slate-800'
                        : 'hover:bg-gray-50',
                  )}>
                  <span className="truncate">{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

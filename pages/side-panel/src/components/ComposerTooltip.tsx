import { useState, type ReactNode } from 'react';

interface ComposerTooltipProps {
  content: string;
  children: ReactNode;
  /** Prefer top in the composer; falls back visually via CSS */
  side?: 'top' | 'bottom';
  disabled?: boolean;
  className?: string;
}

/**
 * Lightweight hover/focus tooltip for composer toolbar buttons.
 * No Radix dependency — keeps the side-panel bundle lean.
 */
export default function ComposerTooltip({
  content,
  children,
  side = 'top',
  disabled = false,
  className = '',
}: ComposerTooltipProps) {
  const [open, setOpen] = useState(false);
  const show = open && !disabled && Boolean(content);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}>
      {children}
      {show && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-center text-[12px] font-medium text-white shadow-sm ${
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}>
          {content}
        </div>
      )}
    </div>
  );
}

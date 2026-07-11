import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../utils';

export type ButtonProps = {
  theme?: 'light' | 'dark';
  /** Planet 9 shadcn-aligned variants */
  variant?: 'primary' | 'default' | 'secondary' | 'outline' | 'danger' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
} & ComponentPropsWithoutRef<'button'>;

export function Button({
  theme = 'light',
  variant = 'primary',
  size = 'default',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const resolved = variant === 'destructive' ? 'danger' : variant === 'default' ? 'primary' : variant;

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all',
        'cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-indigo-500/50',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        {
          'h-9 px-4 py-2': size === 'default',
          'h-8 gap-1.5 px-3': size === 'sm',
          'h-10 px-6': size === 'lg',
          'size-9 p-0': size === 'icon',
        },
        {
          // Planet 9 primary ≈ near-black in light settings UI
          'bg-gray-900 text-white hover:bg-gray-800': resolved === 'primary' && !disabled && theme === 'light',
          'bg-gray-100 text-gray-900 hover:bg-white': resolved === 'primary' && !disabled && theme === 'dark',
          'bg-gray-200 text-gray-500': resolved === 'primary' && disabled,

          'border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50':
            resolved === 'outline' && !disabled && theme === 'light',
          'border border-slate-600 bg-transparent text-gray-200 shadow-sm hover:bg-slate-800':
            resolved === 'outline' && !disabled && theme === 'dark',
          'border border-gray-100 bg-gray-50 text-gray-400': resolved === 'outline' && disabled,

          'bg-gray-100 text-gray-800 hover:bg-gray-200': resolved === 'secondary' && !disabled && theme === 'light',
          'bg-slate-700 text-gray-100 hover:bg-slate-600': resolved === 'secondary' && !disabled && theme === 'dark',
          'bg-gray-50 text-gray-400': resolved === 'secondary' && disabled,

          'bg-red-600 text-white hover:bg-red-700': resolved === 'danger' && !disabled,
          'bg-red-300 text-red-100': resolved === 'danger' && disabled,
        },
        className,
      )}
      disabled={disabled}
      {...props}>
      {children}
    </button>
  );
}

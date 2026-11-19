/**
 * Boutons de l'interface.
 */

import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  outline:
    'border border-brand-600 text-brand-700 hover:bg-brand-50 dark:border-brand-500 dark:text-brand-400 dark:hover:bg-brand-950',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  icon: 'h-9 w-9 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Affiche un indicateur de chargement et désactive le bouton. */
  isLoading?: boolean;
  /** Icône affichée avant le libellé. */
  leftIcon?: ReactNode;
  /** Icône affichée après le libellé. */
  rightIcon?: ReactNode;
}

/** Bouton principal de l'application. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, leftIcon, rightIcon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});

/** Bouton icône sans libellé (accessibilité assurée par `aria-label`). */
export function IconButton({
  label,
  className,
  ...props
}: ButtonProps & { label: string }): JSX.Element {
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      className={cn('rounded-lg', className)}
      {...props}
    />
  );
}

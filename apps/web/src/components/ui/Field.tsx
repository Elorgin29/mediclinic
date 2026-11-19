/**
 * Champs de formulaire.
 *
 * Tous les composants acceptent `label`, `error` et `hint` afin d'harmoniser
 * l'affichage des erreurs de validation Zod renvoyées par l'API comme de celles
 * détectées côté client par react-hook-form.
 */

import { AlertCircle } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Conteneur de champ                                                          */
/* -------------------------------------------------------------------------- */

interface FieldWrapperProps {
  id?: string;
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Enveloppe un champ avec son libellé, son aide et son message d'erreur. */
export function FieldWrapper({ id, label, error, hint, required, className, children }: FieldWrapperProps): JSX.Element {
  return (
    <div className={cn('w-full', className)}>
      {label !== undefined && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-rose-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="error-text flex items-center gap-1" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Champ texte                                                                 */
/* -------------------------------------------------------------------------- */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Icône affichée à gauche dans le champ. */
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, className, id, required, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <FieldWrapper id={fieldId} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn('input', leftIcon && 'pl-9', error && 'input-error', className)}
          {...props}
        />
      </div>
    </FieldWrapper>
  );
});

/* -------------------------------------------------------------------------- */
/* Liste déroulante                                                            */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, placeholder, className, id, required, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <FieldWrapper id={fieldId} label={label} error={error} hint={hint} required={required}>
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn('input', error && 'input-error', className)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
});

/* -------------------------------------------------------------------------- */
/* Zone de texte                                                               */
/* -------------------------------------------------------------------------- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, required, rows = 4, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <FieldWrapper id={fieldId} label={label} error={error} hint={hint} required={required}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn('input resize-y', error && 'input-error', className)}
        {...props}
      />
    </FieldWrapper>
  );
});

/* -------------------------------------------------------------------------- */
/* Case à cocher                                                               */
/* -------------------------------------------------------------------------- */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
        {...props}
      />
      <div>
        <label htmlFor={fieldId} className="text-sm text-slate-700 dark:text-slate-300">
          {label}
        </label>
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          hint !== undefined && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Groupe de champs                                                            */
/* -------------------------------------------------------------------------- */

/** Regroupe deux champs ou plus sur une même ligne (responsive). */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

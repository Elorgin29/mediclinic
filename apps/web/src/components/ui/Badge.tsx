/**
 * Badges et pastilles d'état.
 */

import type { ReactNode } from 'react';

import { cn, statusTone, type Tone } from '@/lib/utils';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-800',
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-800',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800',
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Affiche un point de couleur avant le libellé. */
  dot?: boolean;
}

/** Pastille colorée générique. */
export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Badge de statut typé : la tonalité est déduite du statut métier.
 *
 * @example <StatusBadge kind="appointment" status={appointment.status} label={APPOINTMENT_STATUS_LABELS_FR[appointment.status]} />
 */
export function StatusBadge({
  kind,
  status,
  label,
}: {
  kind: 'appointment' | 'invoice' | 'meeting' | 'prescription' | 'shift' | 'generic';
  status: string;
  label: string;
}): JSX.Element {
  const tone =
    kind === 'generic'
      ? statusTone.generic(status)
      : (statusTone[kind] as (value: never) => Tone)(status as never);

  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/** Compteur compact (notifications non lues, alertes de stock…). */
export function CountBadge({ count, tone = 'danger' }: { count: number; tone?: Tone }): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
        TONES[tone],
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

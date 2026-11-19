/**
 * Cartes et indicateurs.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('card-header', className)}>
      <div className="min-w-0">
        <h2 className="section-title truncate">{title}</h2>
        {description !== undefined && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return <div className={cn('card-body', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800',
        className,
      )}
    >
      {children}
    </div>
  );
}

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

const STAT_TONES: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Variation en pourcentage affichée sous la valeur. */
  trend?: number | null;
  className?: string;
}

/** Carte d'indicateur du tableau de bord. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  trend,
  className,
}: StatCardProps): JSX.Element {
  return (
    <div className={cn('card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {hint !== undefined && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
          {trend !== undefined && trend !== null && (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)} % vs mois précédent
            </p>
          )}
        </div>
        {Icon && (
          <span className={cn('rounded-lg p-2.5', STAT_TONES[tone])}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

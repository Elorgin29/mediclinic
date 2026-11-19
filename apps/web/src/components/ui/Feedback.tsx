/**
 * Retours visuels : chargement, vide, erreur.
 * Ces composants garantissent un rendu cohérent sur tous les écrans de liste.
 */

import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './Button';
import { cn } from '@/lib/utils';

/** Indicateur de chargement circulaire. */
export function Spinner({ className }: { className?: string }): JSX.Element {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-700 dark:text-brand-400', className)} aria-hidden />;
}

/** Bloc de chargement générique. */
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

/** Plusieurs lignes de chargement. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }): JSX.Element {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

/** Squelette d'un tableau en cours de chargement. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }): JSX.Element {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: columns }, (_, index) => (
              <th key={index}>
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }, (_, columnIndex) => (
                <td key={columnIndex}>
                  <Skeleton className={columnIndex === 0 ? 'h-4 w-40' : 'h-4 w-24'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Grille de cartes en cours de chargement (tableaux de bord). */
export function CardsSkeleton({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** État vide : aucune donnée à afficher. */
export function EmptyState({
  title = 'Aucun résultat',
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: typeof Inbox;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <span className="rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        {description !== undefined && (
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** État d'erreur avec possibilité de réessayer. */
export function ErrorState({
  message = 'Impossible de charger les données.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <span className="rounded-full bg-rose-50 p-3 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Voile de chargement superposé à un contenu existant. */
export function LoadingOverlay({ label = 'Chargement…' }: { label?: string }): JSX.Element {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm dark:bg-slate-950/70">
      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

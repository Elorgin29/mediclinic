/**
 * Écran de chargement pleine page et en-tête de page.
 */

import type { ReactNode } from 'react';

import { Spinner } from '@/components/ui';

/** Chargement pleine page, affiché pendant la résolution de la session. */
export function FullPageLoader({ label = 'Chargement…' }: { label?: string }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white">
        MC
      </span>
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Boutons d'action alignés à droite. */
  actions?: ReactNode;
  /** Fil d'Ariane ou retour. */
  breadcrumb?: ReactNode;
  className?: string;
}

/** En-tête standard d'une page du back-office. */
export function PageHeader({ title, subtitle, actions, breadcrumb, className }: PageHeaderProps): JSX.Element {
  return (
    <div className={className}>
      {breadcrumb !== undefined && <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">{breadcrumb}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle !== undefined && <div className="page-subtitle">{subtitle}</div>}
        </div>
        {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

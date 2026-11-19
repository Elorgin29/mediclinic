/**
 * Tableau de données générique et pagination.
 *
 * Le tableau gère : le squelette de chargement, l'état vide, le tri par colonne
 * et l'état d'erreur. Toutes les listes du back-office s'appuient dessus, ce qui
 * garantit une présentation homogène.
 */

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './Button';
import { EmptyState, ErrorState, TableSkeleton } from './Feedback';
import { cn } from '@/lib/utils';

export interface Column<T> {
  /** Identifiant unique de la colonne (sert aussi de clé de tri). */
  key: string;
  header: ReactNode;
  /** Rendu personnalisé de la cellule. Par défaut : `row[key]`. */
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  /** La colonne est-elle triable côté serveur ? */
  sortable?: boolean;
  /** Masque la colonne sur petits écrans. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Tri courant contrôlé par le parent. */
  sort?: { key: string; order: 'asc' | 'desc' } | null;
  onSortChange?: (key: string, order: 'asc' | 'desc') => void;
  className?: string;
}

const ALIGN: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Tableau de données accessible et homogène. */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyTitle = 'Aucun résultat',
  emptyDescription,
  emptyAction,
  onRowClick,
  sort,
  onSortChange,
  className,
}: DataTableProps<T>): JSX.Element {
  if (isLoading) return <TableSkeleton columns={Math.min(columns.length, 6)} />;
  if (isError) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  /** Inverse l'ordre de tri lorsqu'on reclique sur la même colonne. */
  const handleSort = (key: string): void => {
    if (!onSortChange) return;
    const nextOrder = sort?.key === key && sort.order === 'asc' ? 'desc' : 'asc';
    onSortChange(key, nextOrder);
  };

  return (
    <div className={cn('table-wrapper', className)}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  className={cn(ALIGN[column.align ?? 'left'], column.hideOnMobile && 'hidden md:table-cell')}
                  aria-sort={isSorted ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      {column.header}
                      {isSorted ? (
                        sort.order === 'asc' ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(ALIGN[column.align ?? 'left'], column.hideOnMobile && 'hidden md:table-cell', column.className)}
                >
                  {column.render
                    ? column.render(row)
                    : String((row as Record<string, unknown>)[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  className?: string;
}

/** Pagination avec sélection du nombre d'éléments par page. */
export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  className,
}: PaginationProps): JSX.Element | null {
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  // Fenêtre glissante de 5 pages autour de la page courante.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages = Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', className)}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {first}–{last}
        </span>{' '}
        sur <span className="font-medium text-slate-700 dark:text-slate-200">{total}</span> résultat(s)
      </p>

      <div className="flex items-center gap-2">
        {onLimitChange && (
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            aria-label="Nombre d’éléments par page"
            className="input h-8 w-auto py-0 text-xs"
          >
            {[10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value} / page
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>

          {pages.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === page ? 'primary' : 'secondary'}
              onClick={() => onPageChange(value)}
              aria-current={value === page ? 'page' : undefined}
            >
              {value}
            </Button>
          ))}

          <Button
            size="sm"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

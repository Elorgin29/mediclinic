/**
 * Onglets et export du kit d'interface.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Compteur affiché à droite du libellé. */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Onglets contrôlés, accessibles au clavier. */
export function Tabs({ items, value, onChange, className }: TabsProps): JSX.Element {
  return (
    <div className={cn('border-b border-slate-200 dark:border-slate-800', className)} role="tablist">
      <div className="flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const isActive = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    isActive
                      ? 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Button, IconButton } from './Button';
export { Badge, CountBadge, StatusBadge } from './Badge';
export { Card, CardBody, CardFooter, CardHeader, StatCard } from './Card';
export { Checkbox, FieldRow, FieldWrapper, Input, Select, Textarea } from './Field';
export { DataTable, Pagination } from './DataTable';
export {
  CardsSkeleton,
  EmptyState,
  ErrorState,
  LoadingOverlay,
  Skeleton,
  SkeletonText,
  Spinner,
  TableSkeleton,
} from './Feedback';
export { ConfirmDialog, Modal } from './Modal';

export type { Column, DataTableProps } from './DataTable';
export type { SelectOption } from './Field';
export type { StatCardProps } from './Card';

/**
 * Stock de la pharmacie (back-office).
 *
 * Trois vues : indicateurs globaux, alertes (stock bas, péremption proche,
 * produits périmés) et journal complet des mouvements d'entrée/sortie.
 */

import {
  formatDate,
  formatDateTime,
  formatMoney,
  STOCK_MOVEMENT_TYPES,
  type Medication,
  type Paginated,
  type StockMovement,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, PackageSearch, Search } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Input,
  Pagination,
  Select,
  StatCard,
  Tabs,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { formatNumber } from '@/lib/utils';
import { useListQuery } from '@/hooks';

/** Indicateurs agrégés du stock. */
interface StockSummary {
  totalReferences: number;
  totalUnits: number;
  stockValue: number;
  lowStockCount: number;
  expiredCount: number;
  movementsThisMonth: number;
}

/** Alertes consolidées. */
interface StockAlerts {
  lowStock: Array<{
    id: number;
    name: string;
    category: string;
    stock_quantity: number;
    alert_threshold: number;
    missing_quantity: number;
    is_expired: number;
    expires_soon: number;
  }>;
  expiringSoon: Medication[];
  expired: Medication[];
}

/** Mouvement de stock enrichi. */
interface MovementRow extends StockMovement {
  medication_name?: string;
  user_name?: string;
}

export default function StockPage(): JSX.Element {
  const [tab, setTab] = useState('mouvements');

  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } =
    useListQuery({ type: '', from: '', to: '' });

  const summaryQuery = useQuery({
    queryKey: queryKeys.stock.summary,
    queryFn: () => apiGet<StockSummary>('/stock/summary'),
  });

  const alertsQuery = useQuery({
    queryKey: queryKeys.stock.alerts,
    queryFn: () => apiGet<StockAlerts>('/stock/alerts'),
  });

  const movementsQuery = useQuery({
    queryKey: queryKeys.stock.movements(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, value === undefined ? '' : String(value));
      }
      return apiGetRaw<Paginated<MovementRow>>(`/stock/movements?${params.toString()}`);
    },
    enabled: tab === 'mouvements',
  });

  const summary = summaryQuery.data;

  const movementColumns: Column<MovementRow>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'medication_name',
      header: 'Médicament',
      render: (row) => (
        <span className="text-slate-900 dark:text-white">{row.medication_name ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge tone={row.type === 'IN' ? 'success' : 'warning'} dot>
          {row.type === 'IN' ? 'Entrée' : 'Sortie'}
        </Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span
          className={
            row.type === 'IN'
              ? 'font-semibold text-emerald-600 dark:text-emerald-400'
              : 'font-semibold text-amber-600 dark:text-amber-400'
          }
        >
          {row.type === 'IN' ? '+' : '−'}
          {row.quantity}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Motif',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-slate-600 dark:text-slate-300">{row.reason}</span>,
    },
    {
      key: 'user_name',
      header: 'Par',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-slate-500 dark:text-slate-400">{row.user_name ?? '—'}</span>,
    },
  ];

  const meta = movementsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock de la pharmacie"
        subtitle="Niveaux de stock, alertes de réapprovisionnement et traçabilité des mouvements."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Références"
          value={formatNumber(summary?.totalReferences ?? 0)}
          icon={PackageSearch}
          tone="info"
        />
        <StatCard
          label="Unités en stock"
          value={formatNumber(summary?.totalUnits ?? 0)}
          icon={PackageSearch}
          tone="brand"
        />
        <StatCard
          label="Valeur du stock"
          value={formatMoney(summary?.stockValue ?? 0)}
          icon={PackageSearch}
          tone="success"
        />
        <StatCard
          label="Alertes"
          value={`${summary?.lowStockCount ?? 0} seuil · ${summary?.expiredCount ?? 0} périmé(s)`}
          icon={AlertTriangle}
          tone={(summary?.lowStockCount ?? 0) > 0 ? 'danger' : 'brand'}
        />
      </div>

      <Tabs
        items={[
          { id: 'mouvements', label: 'Mouvements', count: meta?.total },
          {
            id: 'alertes',
            label: 'Alertes',
            count:
              (alertsQuery.data?.lowStock.length ?? 0) +
              (alertsQuery.data?.expiringSoon.length ?? 0) +
              (alertsQuery.data?.expired.length ?? 0),
          },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ---------------------------------------------------------------- */}
      {/* Mouvements                                                        */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'mouvements' && (
        <>
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                placeholder="Rechercher…"
                leftIcon={<Search className="h-4 w-4" />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Rechercher un mouvement"
              />
              <Select
                options={[
                  { value: 'IN', label: 'Entrées' },
                  { value: 'OUT', label: 'Sorties' },
                ]}
                placeholder="Tous les types"
                value={String(filters.type ?? '')}
                onChange={(event) => update({ type: event.target.value })}
                aria-label="Filtrer par type"
              />
              <Input
                type="date"
                value={String(filters.from ?? '')}
                onChange={(event) => update({ from: event.target.value })}
                aria-label="Date de début"
              />
              <Input
                type="date"
                value={String(filters.to ?? '')}
                onChange={(event) => update({ to: event.target.value })}
                aria-label="Date de fin"
              />
              <Button variant="ghost" onClick={reset}>
                Réinitialiser
              </Button>
            </div>
          </Card>

          <Card>
            <DataTable
              columns={movementColumns}
              data={movementsQuery.data?.data ?? []}
              rowKey={(row) => row.id}
              isLoading={movementsQuery.isLoading}
              isError={movementsQuery.isError}
              errorMessage={getApiErrorMessage(movementsQuery.error)}
              onRetry={() => void movementsQuery.refetch()}
              emptyTitle="Aucun mouvement"
              emptyDescription="Aucun mouvement de stock ne correspond aux filtres sélectionnés."
              sort={sorting}
              onSortChange={(key, order) => update({ sort: key, order })}
            />

            {meta && (
              <Pagination
                page={page}
                limit={limit}
                total={meta.total}
                totalPages={meta.totalPages}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            )}
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Alertes                                                           */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'alertes' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Stock sous le seuil"
              description={`${alertsQuery.data?.lowStock.length ?? 0} référence(s)`}
            />
            <CardBody className="p-0">
              {(alertsQuery.data?.lowStock ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Tous les stocks sont au-dessus de leur seuil d’alerte.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(alertsQuery.data?.lowStock ?? []).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.category}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          {item.stock_quantity} / {item.alert_threshold}
                        </p>
                        <p className="text-[11px] text-slate-400">manque {item.missing_quantity}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Péremption"
              description={`${alertsQuery.data?.expiringSoon.length ?? 0} proche(s) · ${alertsQuery.data?.expired.length ?? 0} périmé(s)`}
            />
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(alertsQuery.data?.expired ?? []).map((item) => (
                  <li key={`expired-${item.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <p className="truncate text-sm text-slate-900 dark:text-white">{item.name}</p>
                    <Badge tone="danger" dot>
                      Périmé le {formatDate(item.expiry_date)}
                    </Badge>
                  </li>
                ))}
                {(alertsQuery.data?.expiringSoon ?? []).map((item) => (
                  <li key={`soon-${item.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <p className="truncate text-sm text-slate-900 dark:text-white">{item.name}</p>
                    <Badge tone="warning" dot>
                      Expire le {formatDate(item.expiry_date)}
                    </Badge>
                  </li>
                ))}
                {(alertsQuery.data?.expiringSoon ?? []).length === 0 &&
                  (alertsQuery.data?.expired ?? []).length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-slate-500">
                      Aucun produit périmé ou proche de l’expiration.
                    </li>
                  )}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        Types de mouvement suivis : {STOCK_MOVEMENT_TYPES.join(' / ')} · Les entrées apparaissent en{' '}
        <ArrowUpCircle className="inline h-3 w-3 text-emerald-600" aria-hidden /> et les sorties en{' '}
        <ArrowDownCircle className="inline h-3 w-3 text-amber-600" aria-hidden />.
      </p>
    </div>
  );
}

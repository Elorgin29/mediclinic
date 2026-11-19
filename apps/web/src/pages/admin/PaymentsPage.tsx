/**
 * Paiements (back-office).
 *
 * Journal des encaissements : chaque ligne référence la facture et le patient
 * concernés, avec le moyen de paiement et le comptable qui a enregistré
 * l'opération.
 */

import {
  formatDateTime,
  formatMoney,
  PAYMENT_METHOD_LABELS_FR,
  type Paginated,
  type Payment,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Filter, Search } from 'lucide-react';

import { Badge, Button, Card, DataTable, Input, Pagination, Select, StatCard, type Column } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

/** Paiement enrichi du numéro de facture et du patient. */
interface PaymentRow extends Payment {
  invoice_number?: string;
  patient_name?: string;
  user_name?: string;
}

export default function PaymentsPage(): JSX.Element {
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    method: '',
    from: '',
    to: '',
  });

  const paymentsQuery = useQuery({
    queryKey: queryKeys.payments.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<PaymentRow>>(`/payments?${params.toString()}`);
    },
  });

  const rows = paymentsQuery.data?.data ?? [];
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount), 0);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'paid_at',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
          {formatDateTime(row.paid_at)}
        </span>
      ),
    },
    {
      key: 'invoice_number',
      header: 'Facture',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{row.invoice_number ?? `#${row.invoice_id}`}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.patient_name ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(row.amount)}</span>
      ),
    },
    {
      key: 'method',
      header: 'Moyen',
      render: (row) => (
        <Badge tone="neutral">{PAYMENT_METHOD_LABELS_FR[row.method] ?? row.method}</Badge>
      ),
    },
    {
      key: 'reference',
      header: 'Référence',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.reference ?? '—'}</span>
      ),
    },
    {
      key: 'user_name',
      header: 'Encaissé par',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-slate-600 dark:text-slate-300">{row.user_name ?? '—'}</span>,
    },
  ];

  const meta = paymentsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paiements"
        subtitle="Journal des encaissements enregistrés au guichet."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paiements affichés" value={rows.length} icon={CreditCard} tone="info" />
        <StatCard label="Montant cumulé" value={formatMoney(totalAmount)} icon={CreditCard} tone="success" />
        <StatCard label="Total historique" value={meta?.total ?? 0} icon={CreditCard} tone="brand" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Patient ou référence…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un paiement"
          />
          <Select
            options={Object.entries(PAYMENT_METHOD_LABELS_FR).map(([value, label]) => ({ value, label }))}
            placeholder="Tous les moyens"
            value={String(filters.method ?? '')}
            onChange={(event) => update({ method: event.target.value })}
            aria-label="Filtrer par moyen de paiement"
          />
          <Input
            type="date"
            value={String(filters.from ?? '')}
            onChange={(event) => update({ from: event.target.value })}
            aria-label="Date de début"
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={String(filters.to ?? '')}
              onChange={(event) => update({ to: event.target.value })}
              aria-label="Date de fin"
            />
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Réinitialiser les filtres">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          isLoading={paymentsQuery.isLoading}
          isError={paymentsQuery.isError}
          errorMessage={getApiErrorMessage(paymentsQuery.error)}
          onRetry={() => void paymentsQuery.refetch()}
          emptyTitle="Aucun paiement"
          emptyDescription="Aucun encaissement ne correspond aux filtres sélectionnés."
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
    </div>
  );
}

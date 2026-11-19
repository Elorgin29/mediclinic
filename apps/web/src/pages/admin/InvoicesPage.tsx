/**
 * Facturation (back-office).
 *
 * Liste des factures avec filtres, téléchargement PDF et encaissement rapide.
 * Les totaux affichés proviennent de la vue `v_invoice_details` : ils intègrent
 * le solde dû et l'indicateur de retard calculés en base.
 */

import {
  formatDate,
  formatMoney,
  INVOICE_STATUS_LABELS_FR,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS_FR,
  type Invoice,
  type Paginated,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Plus, Receipt, Search, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatCard,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGet, apiGetRaw, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

interface InvoiceStats {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
}

export default function InvoicesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    status: '',
    overdue: '',
  });

  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);

  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Invoice>>(`/invoices?${params.toString()}`);
    },
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.invoices.stats,
    queryFn: () => apiGet<InvoiceStats>('/invoices/stats'),
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: { invoiceId: number; amount: number; method: string; reference?: string }) =>
      apiPost<{ payment: unknown; invoice: Invoice }>('/payments', payload),
    onSuccess: () => {
      toast.success('Paiement enregistré.');
      setPaymentTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Facture',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{row.number}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.patient_name ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'issued_at',
      header: 'Émission',
      sortable: true,
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-slate-700 dark:text-slate-200">{formatDate(row.issued_at)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Échéance {formatDate(row.due_date)}</p>
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: 'Montant TTC',
      align: 'right',
      sortable: true,
      render: (row) => (
        <div className="text-right">
          <p className="font-semibold text-slate-900 dark:text-white">{formatMoney(row.total_amount)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Payé {formatMoney(row.paid_amount)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge kind="invoice" status={row.status} label={INVOICE_STATUS_LABELS_FR[row.status]} />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const balance = Number(row.total_amount) - Number(row.paid_amount);
        return (
          <div className="flex justify-end gap-1">
            <Can permission="payment:create">
              <Button
                size="sm"
                variant="secondary"
                disabled={balance <= 0 || row.status === 'CANCELLED'}
                onClick={() => setPaymentTarget(row)}
              >
                Encaisser
              </Button>
            </Can>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Télécharger la facture"
              onClick={() => void downloadPdf(`/pdf/invoice/${row.id}`)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const meta = invoicesQuery.data?.meta;
  const stats = statsQuery.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Factures"
        subtitle="Émission, encaissement et suivi des impayés."
        actions={
          <Can permission="invoice:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} disabled>
              Nouvelle facture
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total facturé"
          value={formatMoney(stats?.totalInvoiced ?? 0)}
          icon={Receipt}
          tone="info"
        />
        <StatCard label="Total encaissé" value={formatMoney(stats?.totalPaid ?? 0)} icon={Wallet} tone="success" />
        <StatCard
          label="Reste à recouvrer"
          value={formatMoney(stats?.totalOutstanding ?? 0)}
          icon={Wallet}
          tone="warning"
        />
        <StatCard
          label="Factures en retard"
          value={stats?.overdueCount ?? 0}
          icon={AlertTriangle}
          tone={(stats?.overdueCount ?? 0) > 0 ? 'danger' : 'brand'}
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px_auto]">
          <Input
            placeholder="Numéro de facture ou nom du patient…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher une facture"
          />
          <Select
            options={INVOICE_STATUSES.map((status) => ({
              value: status,
              label: INVOICE_STATUS_LABELS_FR[status],
            }))}
            placeholder="Tous les statuts"
            value={String(filters.status ?? '')}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Filtrer par statut"
          />
          <Select
            options={[{ value: 'true', label: 'En retard uniquement' }]}
            placeholder="Toutes les échéances"
            value={String(filters.overdue ?? '')}
            onChange={(event) => update({ overdue: event.target.value })}
            aria-label="Filtrer les retards"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={invoicesQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={invoicesQuery.isLoading}
          isError={invoicesQuery.isError}
          errorMessage={getApiErrorMessage(invoicesQuery.error)}
          onRetry={() => void invoicesQuery.refetch()}
          emptyTitle="Aucune facture"
          emptyDescription="Aucune facture ne correspond aux filtres sélectionnés."
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

      <PaymentModal
        invoice={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        isPending={paymentMutation.isPending}
        onSubmit={(payload) => paymentMutation.mutate(payload)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modale d'encaissement                                                       */
/* -------------------------------------------------------------------------- */

function PaymentModal({
  invoice,
  onClose,
  isPending,
  onSubmit,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (payload: { invoiceId: number; amount: number; method: string; reference?: string }) => void;
}): JSX.Element {
  const balance = invoice ? Number(invoice.total_amount) - Number(invoice.paid_amount) : 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CARD');
  const [reference, setReference] = useState('');

  // Le montant proposé par défaut est le solde restant.
  const effectiveAmount = amount === '' ? balance.toFixed(2) : amount;

  const handleSubmit = (): void => {
    if (!invoice) return;
    const parsed = Number(effectiveAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Le montant doit être supérieur à zéro.');
      return;
    }
    if (parsed > balance + 0.01) {
      toast.error(`Le montant dépasse le solde restant (${formatMoney(balance)}).`);
      return;
    }
    onSubmit({
      invoiceId: invoice.id,
      amount: parsed,
      method,
      reference: reference.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={invoice !== null}
      onClose={onClose}
      title="Encaisser un paiement"
      description={invoice ? `${invoice.number} — ${invoice.patient_name ?? ''}` : undefined}
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            Enregistrer le paiement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Total facture</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {formatMoney(invoice?.total_amount ?? 0)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Déjà payé</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {formatMoney(invoice?.paid_amount ?? 0)}
            </span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
            <span className="font-medium text-slate-700 dark:text-slate-200">Solde restant</span>
            <span className="font-semibold text-brand-700 dark:text-brand-400">{formatMoney(balance)}</span>
          </div>
        </div>

        <Input
          label="Montant encaissé"
          type="number"
          step="0.01"
          min="0.01"
          max={balance.toFixed(2)}
          value={effectiveAmount}
          onChange={(event) => setAmount(event.target.value)}
        />

        <Select
          label="Moyen de paiement"
          options={PAYMENT_METHODS.map((value) => ({
            value,
            label: PAYMENT_METHOD_LABELS_FR[value],
          }))}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        />

        <Input
          label="Référence (facultatif)"
          placeholder="N° de chèque, virement…"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </div>
    </Modal>
  );
}

/**
 * Paiements (back-office).
 *
 * Journal des encaissements : chaque ligne référence la facture et le patient
 * concernés, avec le moyen de paiement et le comptable qui a enregistré
 * l'opération. Un encaissement peut être créé ou annulé ; la facture est
 * recalculée automatiquement par les triggers.
 */

import {
  formatDateTime,
  formatMoney,
  PAYMENT_METHOD_LABELS_FR,
  PAYMENT_METHODS,
  type Invoice,
  type Paginated,
  type Payment,
  type PaymentMethod,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatCard,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGetRaw, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

/** Paiement enrichi du numéro de facture et du patient. */
interface PaymentRow extends Payment {
  invoice_number?: string;
  patient_name?: string;
  user_name?: string;
}

/** Convertit un horodatage en valeur d'un `<input type="datetime-local">`. */
function toDateTimeInput(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`;
}

export default function PaymentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    method: '',
    from: '',
    to: '',
  });

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null);

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

  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices.all({ limit: 200 }),
    queryFn: () => apiGetRaw<Paginated<Invoice>>('/invoices?limit=200'),
    enabled: formOpen,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ payment: Payment; invoice: Invoice }>('/payments', payload),
    onSuccess: () => {
      toast.success('Paiement enregistré.');
      setFormOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/payments/${id}`),
    onSuccess: () => {
      toast.success('Paiement annulé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Can permission="payment:delete">
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
            aria-label="Annuler le paiement"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </Can>
      ),
    },
  ];

  const meta = paymentsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paiements"
        subtitle="Journal des encaissements enregistrés au guichet."
        actions={
          <Can permission="payment:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              Nouveau paiement
            </Button>
          </Can>
        }
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
          emptyAction={
            <Can permission="payment:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
                Enregistrer un paiement
              </Button>
            </Can>
          }
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

      <PaymentFormModal
        isOpen={formOpen}
        invoices={(invoicesQuery.data?.data ?? []).filter(
          (invoice) => invoice.status !== 'CANCELLED' && Number(invoice.total_amount) - Number(invoice.paid_amount) > 0,
        )}
        isLoadingInvoices={invoicesQuery.isLoading}
        isPending={createMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Annuler ce paiement ?"
        message={
          <>
            L’encaissement de{' '}
            <span className="font-semibold">{formatMoney(deleteTarget?.amount ?? 0)}</span> sur la facture{' '}
            <span className="font-semibold">{deleteTarget?.invoice_number ?? ''}</span> sera supprimé et le
            solde de la facture recalculé.
          </>
        }
        confirmLabel="Annuler le paiement"
        isLoading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaire d'encaissement                                                   */
/* -------------------------------------------------------------------------- */

function PaymentFormModal({
  isOpen,
  invoices,
  isLoadingInvoices,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  invoices: Invoice[];
  isLoadingInvoices: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [paidAt, setPaidAt] = useState('');
  const [reference, setReference] = useState('');

  const selectedInvoice = invoices.find((invoice) => String(invoice.id) === invoiceId);
  const balance = selectedInvoice
    ? Number(selectedInvoice.total_amount) - Number(selectedInvoice.paid_amount)
    : 0;

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceId('');
    setAmount('');
    setMethod('CARD');
    setPaidAt(toDateTimeInput(new Date()));
    setReference('');
  }, [isOpen]);

  const handleSubmit = (): void => {
    if (!selectedInvoice) {
      toast.error('Sélectionnez la facture à encaisser.');
      return;
    }
    const parsed = amount === '' ? balance : Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Le montant doit être supérieur à zéro.');
      return;
    }
    if (parsed > balance + 0.01) {
      toast.error(`Le montant dépasse le solde restant (${formatMoney(balance)}).`);
      return;
    }

    onSubmit({
      invoiceId: selectedInvoice.id,
      amount: parsed,
      method,
      ...(paidAt ? { paidAt: paidAt.replace('T', ' ') } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enregistrer un paiement"
      description="Le solde de la facture est mis à jour automatiquement."
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
        <Select
          label="Facture"
          required
          placeholder={isLoadingInvoices ? 'Chargement…' : 'Choisir une facture à encaisser'}
          options={invoices.map((invoice) => ({
            value: invoice.id,
            label: `${invoice.number} — ${invoice.patient_name ?? 'Patient'} · solde ${formatMoney(
              Number(invoice.total_amount) - Number(invoice.paid_amount),
            )}`,
          }))}
          value={invoiceId}
          onChange={(event) => {
            setInvoiceId(event.target.value);
            setAmount('');
          }}
        />

        {selectedInvoice && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Total facture</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatMoney(selectedInvoice.total_amount)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Déjà payé</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatMoney(selectedInvoice.paid_amount)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 dark:border-slate-700">
              <span className="font-medium text-slate-700 dark:text-slate-200">Solde restant</span>
              <span className="font-semibold text-brand-700 dark:text-brand-400">{formatMoney(balance)}</span>
            </div>
          </div>
        )}

        <Input
          label="Montant encaissé"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder={selectedInvoice ? balance.toFixed(2) : '0.00'}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          hint="Laisser vide pour encaisser la totalité du solde."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Moyen de paiement"
            options={PAYMENT_METHODS.map((value) => ({
              value,
              label: PAYMENT_METHOD_LABELS_FR[value],
            }))}
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          />
          <Input
            label="Date du paiement"
            type="datetime-local"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
          />
        </div>

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

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
  type InvoiceStatus,
  type Paginated,
  type Patient,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Download, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  ConfirmDialog,
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
import { PatientPicker } from '@/components/admin/PatientPicker';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
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
  const [formTarget, setFormTarget] = useState<Invoice | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [statusTarget, setStatusTarget] = useState<Invoice | null>(null);
  const [newStatus, setNewStatus] = useState<InvoiceStatus>('ISSUED');

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

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Invoice>('/invoices', payload),
    onSuccess: () => {
      toast.success('Facture créée.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Invoice>(`/invoices/${id}`, payload),
    onSuccess: () => {
      toast.success('Facture mise à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/invoices/${id}`),
    onSuccess: () => {
      toast.success('Facture supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      apiPatch<Invoice>(`/invoices/${statusTarget?.id}/status`, { status: newStatus }),
    onSuccess: () => {
      toast.success('Statut de la facture mis à jour.');
      setStatusTarget(null);
      invalidate();
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
            <Can permission="invoice:manage">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Changer le statut de la facture"
                onClick={() => {
                  setStatusTarget(row);
                  setNewStatus(row.status === 'CANCELLED' ? 'ISSUED' : 'CANCELLED');
                }}
              >
                <Ban className="h-4 w-4" />
              </Button>
            </Can>
            <Can permission="invoice:update">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Modifier la facture"
                disabled={row.status === 'CANCELLED'}
                onClick={() => setFormTarget(row)}
              >
                <Pencil className="h-4 w-4" />
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
            <Can permission="invoice:delete">
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                aria-label="Supprimer la facture"
                onClick={() => setDeleteTarget(row)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Can>
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
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setFormTarget('new')}
            >
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
          emptyAction={
            <Can permission="invoice:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Créer une facture
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

      <PaymentModal
        invoice={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        isPending={paymentMutation.isPending}
        onSubmit={(payload) => paymentMutation.mutate(payload)}
      />

      <InvoiceFormModal
        isOpen={formTarget !== null}
        invoice={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => setFormTarget(null)}
        onSubmit={(payload) => {
          if (formTarget !== null && formTarget !== 'new') {
            updateMutation.mutate({ id: formTarget.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <Modal
        isOpen={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title="Changer le statut de la facture"
        description={statusTarget ? `${statusTarget.number} — ${statusTarget.patient_name ?? ''}` : undefined}
        isBusy={statusMutation.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              Annuler
            </Button>
            <Button onClick={() => statusMutation.mutate()} isLoading={statusMutation.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Nouveau statut"
            options={[
              { value: 'ISSUED', label: 'Émise' },
              { value: 'CANCELLED', label: 'Annulée' },
            ]}
            value={newStatus}
            onChange={(event) => setNewStatus(event.target.value as InvoiceStatus)}
          />
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            L’annulation est définitive côté serveur : une facture annulée ne peut plus être encaissée.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer cette facture ?"
        message={
          <>
            La facture <span className="font-semibold">{deleteTarget?.number}</span> de{' '}
            <span className="font-semibold">{deleteTarget?.patient_name ?? 'ce patient'}</span> sera
            définitivement supprimée, ainsi que ses paiements associés.
          </>
        }
        confirmLabel="Supprimer"
        isLoading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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

/* -------------------------------------------------------------------------- */
/* Création / modification d'une facture                                       */
/* -------------------------------------------------------------------------- */

interface InvoiceItemDraft {
  label: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: InvoiceItemDraft = { label: '', quantity: '1', unitPrice: '' };

function InvoiceFormModal({
  isOpen,
  invoice,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  invoice?: Invoice;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [items, setItems] = useState<InvoiceItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [vatRate, setVatRate] = useState('20');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'ISSUED'>('ISSUED');

  useEffect(() => {
    if (!isOpen) return;
    setPatient(null);
    if (invoice) {
      setItems(
        invoice.items && invoice.items.length > 0
          ? invoice.items.map((item) => ({
              label: item.label,
              quantity: String(item.quantity),
              unitPrice: item.unit_price,
            }))
          : [{ ...EMPTY_ITEM }],
      );
      setVatRate(String(Number(invoice.vat_rate)));
      setDueDate(invoice.due_date ? invoice.due_date.slice(0, 10) : '');
      setStatus(invoice.status === 'DRAFT' ? 'DRAFT' : 'ISSUED');
    } else {
      setItems([{ ...EMPTY_ITEM }]);
      setVatRate('20');
      setDueDate('');
      setStatus('ISSUED');
    }
  }, [isOpen, invoice]);

  const updateItem = (index: number, patch: Partial<InvoiceItemDraft>): void => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleSubmit = (): void => {
    if (!invoice && !patient) {
      toast.error('Sélectionnez un patient.');
      return;
    }

    const payloadItems = items.map((item) => ({
      label: item.label.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    if (
      payloadItems.some(
        (item) => !item.label || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.quantity < 1,
      )
    ) {
      toast.error('Chaque ligne doit avoir un libellé, une quantité et un prix unitaire valides.');
      return;
    }

    const vat = Number(vatRate);
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
      toast.error('Le taux de TVA doit être compris entre 0 et 100.');
      return;
    }

    const base: Record<string, unknown> = {
      items: payloadItems,
      vatRate: vat,
      ...(dueDate ? { dueDate } : {}),
    };

    if (invoice) {
      onSubmit(base);
    } else {
      onSubmit({ ...base, patientId: patient!.id, status });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={invoice ? 'Modifier la facture' : 'Nouvelle facture'}
      description={
        invoice
          ? `${invoice.number} — ${invoice.patient_name ?? 'Patient'}`
          : 'Ajoutez les prestations puis émettez la facture.'
      }
      size="xl"
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {invoice ? 'Enregistrer' : 'Créer la facture'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {invoice ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Patient
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              {invoice.patient_name ?? `Dossier #${invoice.patient_id}`}
            </p>
          </div>
        ) : (
          <PatientPicker
            value={patient}
            onChange={setPatient}
            required
            hint="Recherchez un patient existant par nom, email ou téléphone."
          />
        )}

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Lignes de facturation</p>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
            >
              Ajouter une ligne
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Ligne {index + 1}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Retirer cette ligne"
                    disabled={items.length === 1}
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_100px_130px]">
                  <Input
                    label="Libellé"
                    required
                    placeholder="ex. Consultation de cardiologie"
                    value={item.label}
                    onChange={(event) => updateItem(index, { label: event.target.value })}
                  />
                  <Input
                    label="Quantité"
                    type="number"
                    min={1}
                    required
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  />
                  <Input
                    label="Prix unitaire"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Taux de TVA (%)"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={vatRate}
            onChange={(event) => setVatRate(event.target.value)}
          />
          <Input
            label="Date d'échéance"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        {!invoice && (
          <Select
            label="Statut initial"
            options={[
              { value: 'ISSUED', label: 'Émise' },
              { value: 'DRAFT', label: 'Brouillon' },
            ]}
            value={status}
            onChange={(event) => setStatus(event.target.value as 'DRAFT' | 'ISSUED')}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Ordonnances (back-office).
 *
 * Liste des prescriptions avec leur statut, création et modification des
 * lignes, suppression, impression du document et dispensation par la pharmacie.
 */

import {
  formatDate,
  formatDateTime,
  PRESCRIPTION_STATUS_LABELS_FR,
  PRESCRIPTION_STATUSES,
  type Consultation,
  type Medication,
  type Paginated,
  type Prescription,
  type PrescriptionStatus,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

/** Ordonnance enrichie par la vue SQL. */
interface PrescriptionRow extends Prescription {
  patient_name?: string;
  specialty_name?: string;
  items_count?: number;
  total_quantity?: number;
}

export default function PrescriptionsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } =
    useListQuery({ status: '', from: '', to: '' });

  const [formTarget, setFormTarget] = useState<PrescriptionRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrescriptionRow | null>(null);

  const prescriptionsQuery = useQuery({
    queryKey: queryKeys.prescriptions.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<PrescriptionRow>>(`/prescriptions?${params.toString()}`);
    },
  });

  const consultationsQuery = useQuery({
    queryKey: queryKeys.consultations.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Consultation>>('/consultations?limit=100'),
    enabled: formTarget === 'new',
  });

  const medicationsQuery = useQuery({
    queryKey: queryKeys.medications.all({ limit: 200 }),
    queryFn: () => apiGetRaw<Paginated<Medication>>('/medications?limit=200'),
    enabled: formTarget !== null,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['medications'] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
  };

  const dispenseMutation = useMutation({
    mutationFn: (prescriptionId: number) => apiPost<Prescription>(`/prescriptions/${prescriptionId}/dispense`, {}),
    onSuccess: () => {
      toast.success('Ordonnance dispensée : le stock a été mis à jour.');
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Prescription>('/prescriptions', payload),
    onSuccess: () => {
      toast.success('Ordonnance créée.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Prescription>(`/prescriptions/${id}`, payload),
    onSuccess: () => {
      toast.success('Ordonnance mise à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/prescriptions/${id}`),
    onSuccess: () => {
      toast.success('Ordonnance supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<PrescriptionRow>[] = [
    {
      key: 'issued_at',
      header: 'Émise le',
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{formatDate(row.issued_at)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">n° {row.id}</p>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      render: (row) => <span className="text-slate-700 dark:text-slate-200">{row.patient_name ?? '—'}</span>,
    },
    {
      key: 'doctor_name',
      header: 'Prescripteur',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-slate-700 dark:text-slate-200">{row.doctor_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.specialty_name ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'items_count',
      header: 'Lignes',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{row.items_count ?? row.items?.length ?? 0}</p>
          <p className="text-xs text-slate-400">{row.total_quantity ?? 0} unité(s)</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          kind="prescription"
          status={row.status}
          label={PRESCRIPTION_STATUS_LABELS_FR[row.status]}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="prescription:manage">
            <Button
              size="sm"
              variant="secondary"
              disabled={row.status !== 'ISSUED'}
              onClick={() => dispenseMutation.mutate(row.id)}
              isLoading={dispenseMutation.isPending}
              leftIcon={<Package className="h-3.5 w-3.5" />}
            >
              Dispenser
            </Button>
          </Can>
          <Can permission="prescription:update">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Modifier l’ordonnance"
              onClick={() => setFormTarget(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Télécharger l’ordonnance"
            onClick={() => void downloadPdf(`/pdf/prescription/${row.id}`)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Can permission="prescription:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer l’ordonnance"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = prescriptionsQuery.data?.meta;
  const rows = prescriptionsQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ordonnances"
        subtitle="Prescriptions émises par les médecins et leur statut de dispensation."
        actions={
          <Can permission="prescription:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouvelle ordonnance
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ordonnances" value={meta?.total ?? 0} icon={FileText} tone="info" />
        <StatCard
          label="À dispenser"
          value={rows.filter((item) => item.status === 'ISSUED').length}
          icon={Package}
          tone="warning"
        />
        <StatCard
          label="Dispensées"
          value={rows.filter((item) => item.status === 'DISPENSED').length}
          icon={Package}
          tone="success"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Patient ou médecin…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher une ordonnance"
          />
          <Select
            options={PRESCRIPTION_STATUSES.map((status) => ({
              value: status,
              label: PRESCRIPTION_STATUS_LABELS_FR[status],
            }))}
            placeholder="Tous les statuts"
            value={String(filters.status ?? '')}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Filtrer par statut"
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
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          isLoading={prescriptionsQuery.isLoading}
          isError={prescriptionsQuery.isError}
          errorMessage={getApiErrorMessage(prescriptionsQuery.error)}
          onRetry={() => void prescriptionsQuery.refetch()}
          emptyTitle="Aucune ordonnance"
          emptyDescription="Aucune prescription ne correspond aux filtres sélectionnés."
          emptyAction={
            <Can permission="prescription:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Créer une ordonnance
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

      <p className="text-center text-xs text-slate-400">
        La dispensation crée automatiquement une sortie de stock pour chaque médicament : le stock de la
        pharmacie reste ainsi toujours cohérent. Dernier mouvement visible :{' '}
        {formatDateTime(new Date())}
      </p>

      <PrescriptionFormModal
        isOpen={formTarget !== null}
        prescription={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        consultations={consultationsQuery.data?.data ?? []}
        medications={medicationsQuery.data?.data ?? []}
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

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer cette ordonnance ?"
        message={
          <>
            L’ordonnance n° {deleteTarget?.id} de{' '}
            <span className="font-semibold">{deleteTarget?.patient_name ?? 'ce patient'}</span> sera
            définitivement supprimée.
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
/* Formulaire de création / modification                                       */
/* -------------------------------------------------------------------------- */

interface ItemDraft {
  medicationId: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: string;
}

const EMPTY_ITEM: ItemDraft = {
  medicationId: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
  quantity: '1',
};

function PrescriptionFormModal({
  isOpen,
  prescription,
  consultations,
  medications,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  prescription?: PrescriptionRow;
  consultations: Consultation[];
  medications: Medication[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [consultationId, setConsultationId] = useState('');
  const [status, setStatus] = useState<PrescriptionStatus>('ISSUED');
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);

  useEffect(() => {
    if (!isOpen) return;
    if (prescription) {
      setConsultationId(String(prescription.consultation_id));
      setStatus(prescription.status);
      setItems(
        prescription.items && prescription.items.length > 0
          ? prescription.items.map((item) => ({
              medicationId: String(item.medication_id),
              dosage: item.dosage,
              frequency: item.frequency,
              duration: item.duration,
              instructions: item.instructions ?? '',
              quantity: String(item.quantity),
            }))
          : [{ ...EMPTY_ITEM }],
      );
    } else {
      setConsultationId('');
      setStatus('ISSUED');
      setItems([{ ...EMPTY_ITEM }]);
    }
  }, [isOpen, prescription]);

  const updateItem = (index: number, patch: Partial<ItemDraft>): void => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleSubmit = (): void => {
    if (!prescription && !consultationId) {
      toast.error('Sélectionnez la consultation concernée.');
      return;
    }

    const payloadItems = items.map((item) => ({
      medicationId: Number(item.medicationId),
      dosage: item.dosage.trim(),
      frequency: item.frequency.trim(),
      duration: item.duration.trim(),
      instructions: item.instructions.trim() || undefined,
      quantity: Number(item.quantity),
    }));

    if (
      payloadItems.some(
        (item) => !item.medicationId || !item.dosage || !item.frequency || !item.duration || item.quantity < 1,
      )
    ) {
      toast.error('Chaque ligne doit préciser un médicament, une posologie, une fréquence et une durée.');
      return;
    }

    if (prescription) {
      onSubmit({ status, items: payloadItems });
    } else {
      onSubmit({ consultationId: Number(consultationId), items: payloadItems });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={prescription ? 'Modifier l’ordonnance' : 'Nouvelle ordonnance'}
      description={
        prescription
          ? `Ordonnance n° ${prescription.id} — ${prescription.patient_name ?? 'Patient'}`
          : 'Sélectionnez la consultation puis ajoutez une ou plusieurs lignes de traitement.'
      }
      size="xl"
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {prescription ? 'Enregistrer' : 'Créer l’ordonnance'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {prescription ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Consultation
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                #{prescription.consultation_id} — {prescription.patient_name ?? 'Patient'}
              </p>
            </div>
            <Select
              label="Statut"
              options={PRESCRIPTION_STATUSES.map((value) => ({
                value,
                label: PRESCRIPTION_STATUS_LABELS_FR[value],
              }))}
              value={status}
              onChange={(event) => setStatus(event.target.value as PrescriptionStatus)}
            />
          </div>
        ) : (
          <Select
            label="Consultation"
            required
            placeholder="Choisir une consultation"
            options={consultations.map((consultation) => ({
              value: consultation.id,
              label: `#${consultation.id} — ${consultation.patient_name ?? 'Patient'} · ${formatDate(
                consultation.created_at,
              )}`,
            }))}
            value={consultationId}
            onChange={(event) => setConsultationId(event.target.value)}
          />
        )}

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Lignes de prescription</p>
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

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Médicament"
                    required
                    placeholder="Choisir un médicament"
                    options={medications.map((medication) => ({
                      value: medication.id,
                      label: `${medication.name} — ${medication.unit} (stock ${medication.stock_quantity})`,
                    }))}
                    value={item.medicationId}
                    onChange={(event) => updateItem(index, { medicationId: event.target.value })}
                  />
                  <Input
                    label="Quantité"
                    type="number"
                    min={1}
                    required
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Posologie"
                    required
                    placeholder="ex. 1 comprimé"
                    value={item.dosage}
                    onChange={(event) => updateItem(index, { dosage: event.target.value })}
                  />
                  <Input
                    label="Fréquence"
                    required
                    placeholder="ex. 2 fois par jour"
                    value={item.frequency}
                    onChange={(event) => updateItem(index, { frequency: event.target.value })}
                  />
                  <Input
                    label="Durée"
                    required
                    placeholder="ex. 7 jours"
                    value={item.duration}
                    onChange={(event) => updateItem(index, { duration: event.target.value })}
                  />
                </div>

                <Textarea
                  className="mt-3"
                  label="Instructions particulières"
                  rows={2}
                  value={item.instructions}
                  onChange={(event) => updateItem(index, { instructions: event.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

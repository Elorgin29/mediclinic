/**
 * Consultations (back-office).
 *
 * Liste des comptes-rendus avec création depuis un rendez-vous, modification,
 * suppression et impression PDF.
 */

import { formatDateTime, type Appointment, type Consultation, type Paginated } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';
import { truncate, cn } from '@/lib/utils';
import { useListQuery } from '@/hooks';

/** Consultation enrichie par la vue SQL. */
interface ConsultationRow extends Consultation {
  patient_name?: string;
  specialty_name?: string;
  prescriptions_count?: number;
}

export default function ConsultationsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    from: '',
    to: '',
  });

  const [formTarget, setFormTarget] = useState<ConsultationRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConsultationRow | null>(null);

  const consultationsQuery = useQuery({
    queryKey: queryKeys.consultations.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<ConsultationRow>>(`/consultations?${params.toString()}`);
    },
  });

  const appointmentsQuery = useQuery({
    queryKey: queryKeys.appointments.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Appointment>>('/appointments?limit=100'),
    enabled: formTarget === 'new',
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Consultation>('/consultations', payload),
    onSuccess: () => {
      toast.success('Consultation enregistrée.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Consultation>(`/consultations/${id}`, payload),
    onSuccess: () => {
      toast.success('Consultation mise à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/consultations/${id}`),
    onSuccess: () => {
      toast.success('Consultation supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<ConsultationRow>[] = [
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
      key: 'patient_name',
      header: 'Patient',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{row.patient_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dossier #{row.id}</p>
        </div>
      ),
    },
    {
      key: 'doctor_name',
      header: 'Médecin',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-slate-700 dark:text-slate-200">{row.doctor_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.specialty_name ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'diagnosis',
      header: 'Diagnostic',
      render: (row) => (
        <span className="text-sm text-slate-700 dark:text-slate-300" title={row.diagnosis}>
          {truncate(row.diagnosis, 64)}
        </span>
      ),
    },
    {
      key: 'prescriptions_count',
      header: 'Ordonnances',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span
          className={cn(
            'inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold',
            (row.prescriptions_count ?? 0) > 0
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {row.prescriptions_count ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="consultation:update">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Modifier la consultation"
              onClick={() => setFormTarget(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Télécharger le compte-rendu"
            onClick={() => void downloadPdf(`/pdf/consultation/${row.id}`)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Can permission="consultation:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer la consultation"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = consultationsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consultations"
        subtitle="Comptes-rendus de consultation et diagnostics associés."
        actions={
          <Can permission="consultation:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouvelle consultation
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Consultations" value={meta?.total ?? 0} icon={ClipboardList} tone="info" />
        <StatCard
          label="Avec ordonnance"
          value={(consultationsQuery.data?.data ?? []).filter((item) => (item.prescriptions_count ?? 0) > 0).length}
          icon={ClipboardList}
          tone="success"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Patient ou diagnostic…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher une consultation"
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
          data={consultationsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={consultationsQuery.isLoading}
          isError={consultationsQuery.isError}
          errorMessage={getApiErrorMessage(consultationsQuery.error)}
          onRetry={() => void consultationsQuery.refetch()}
          emptyTitle="Aucune consultation"
          emptyDescription="Aucun compte-rendu ne correspond aux filtres sélectionnés."
          emptyAction={
            <Can permission="consultation:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Saisir une consultation
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

      <ConsultationFormModal
        isOpen={formTarget !== null}
        consultation={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        appointments={appointmentsQuery.data?.data ?? []}
        isLoadingAppointments={appointmentsQuery.isLoading}
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
        title="Supprimer cette consultation ?"
        message={
          <>
            Le compte-rendu de{' '}
            <span className="font-semibold">{deleteTarget?.patient_name ?? 'ce patient'}</span> sera
            définitivement supprimé. Les ordonnances rattachées peuvent empêcher la suppression.
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

function ConsultationFormModal({
  isOpen,
  consultation,
  appointments,
  isLoadingAppointments,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  consultation?: ConsultationRow;
  appointments: Appointment[];
  isLoadingAppointments: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({
    appointmentId: '',
    diagnosis: '',
    notes: '',
    followUpAt: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      appointmentId: consultation ? String(consultation.appointment_id) : '',
      diagnosis: consultation?.diagnosis ?? '',
      notes: consultation?.notes ?? '',
      followUpAt: consultation?.follow_up_at ? consultation.follow_up_at.slice(0, 10) : '',
    });
  }, [isOpen, consultation]);

  const handleSubmit = (): void => {
    if (!consultation && !values.appointmentId) {
      toast.error('Sélectionnez le rendez-vous concerné.');
      return;
    }
    if (values.diagnosis.trim().length < 2) {
      toast.error('Le diagnostic est obligatoire.');
      return;
    }

    const base = {
      diagnosis: values.diagnosis.trim(),
      notes: values.notes.trim() || undefined,
      ...(values.followUpAt ? { followUpAt: values.followUpAt } : {}),
    };

    if (consultation) {
      onSubmit(base);
    } else {
      onSubmit({ ...base, appointmentId: Number(values.appointmentId) });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={consultation ? 'Modifier la consultation' : 'Nouvelle consultation'}
      description={
        consultation
          ? `${consultation.patient_name ?? 'Patient'} — ${formatDateTime(consultation.created_at)}`
          : 'Le rendez-vous associé passera automatiquement au statut « terminé ».'
      }
      size="lg"
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {consultation ? 'Enregistrer' : 'Créer la consultation'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {consultation ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rendez-vous
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              #{consultation.appointment_id} — {consultation.patient_name ?? 'Patient'} ·{' '}
              {consultation.doctor_name ?? 'Médecin'}
            </p>
          </div>
        ) : (
          <Select
            label="Rendez-vous"
            required
            placeholder={isLoadingAppointments ? 'Chargement…' : 'Choisir un rendez-vous'}
            options={appointments.map((appointment) => ({
              value: appointment.id,
              label: `${formatDateTime(appointment.scheduled_at)} — ${
                appointment.patient_name ?? `Patient #${appointment.patient_id}`
              } · ${appointment.doctor_name ?? `Médecin #${appointment.doctor_id}`}`,
            }))}
            value={values.appointmentId}
            onChange={(event) => setValues({ ...values, appointmentId: event.target.value })}
            hint="Les rendez-vous annulés ou déjà couverts par un compte-rendu seront refusés par le serveur."
          />
        )}

        <Textarea
          label="Diagnostic"
          required
          rows={3}
          value={values.diagnosis}
          onChange={(event) => setValues({ ...values, diagnosis: event.target.value })}
        />

        <Textarea
          label="Observations et conduite à tenir"
          rows={5}
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />

        <Input
          label="Date de suivi (optionnelle)"
          type="date"
          value={values.followUpAt}
          onChange={(event) => setValues({ ...values, followUpAt: event.target.value })}
        />
      </div>
    </Modal>
  );
}

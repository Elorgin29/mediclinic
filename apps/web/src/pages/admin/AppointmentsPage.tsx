/**
 * Gestion des rendez-vous (back-office).
 *
 * Vue liste avec filtres (statut, type, période, médecin), création,
 * modification, suppression et changement de statut. L'agenda du jour est
 * accessible via le filtre de période.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPE_LABELS_FR,
  APPOINTMENT_TYPES,
  formatDateTime,
  type Appointment,
  type AppointmentStatus,
  type Doctor,
  type Paginated,
  type Patient,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Filter, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatusBadge,
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader as Header } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { PatientPicker } from '@/components/admin/PatientPicker';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

/** Statuts vers lesquels une transition est proposée dans l'interface. */
const NEXT_STATUSES: AppointmentStatus[] = [...APPOINTMENT_STATUSES];

/** Convertit un horodatage API en valeur d'un `<input type="datetime-local">`. */
function toDateTimeInput(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return normalized.slice(0, 16);
}

export default function AppointmentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    status: '',
    type: '',
    from: '',
    to: '',
  });

  const [formTarget, setFormTarget] = useState<Appointment | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [statusTarget, setStatusTarget] = useState<Appointment | null>(null);
  const [newStatus, setNewStatus] = useState<AppointmentStatus>('CONFIRMED');
  const [cancelReason, setCancelReason] = useState('');

  /* ------------------------------------------------------------------ */
  /* Données                                                             */
  /* ------------------------------------------------------------------ */
  const appointmentsQuery = useQuery({
    queryKey: queryKeys.appointments.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Appointment>>(`/appointments?${params.toString()}`);
    },
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Doctor>>('/doctors?limit=100'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */
  const statusMutation = useMutation({
    mutationFn: () =>
      apiPatch<Appointment>(`/appointments/${statusTarget?.id}/status`, {
        status: newStatus,
        ...(newStatus === 'CANCELLED' && cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Statut du rendez-vous mis à jour.');
      setStatusTarget(null);
      setCancelReason('');
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Appointment>('/appointments', payload),
    onSuccess: () => {
      toast.success('Rendez-vous créé.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Appointment>(`/appointments/${id}`, payload),
    onSuccess: () => {
      toast.success('Rendez-vous mis à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/appointments/${id}`),
    onSuccess: () => {
      toast.success('Rendez-vous supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  /* ------------------------------------------------------------------ */
  /* Colonnes                                                            */
  /* ------------------------------------------------------------------ */
  const columns: Column<Appointment>[] = [
    {
      key: 'scheduled_at',
      header: 'Date et heure',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{formatDateTime(row.scheduled_at)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.duration} min</p>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{row.patient_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.reason ?? 'Sans motif'}</p>
        </div>
      ),
    },
    {
      key: 'doctor_name',
      header: 'Médecin',
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{row.doctor_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.department_name ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {APPOINTMENT_TYPE_LABELS_FR[row.type]}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge kind="appointment" status={row.status} label={APPOINTMENT_STATUS_LABELS_FR[row.status]} />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="appointment:update">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setStatusTarget(row);
                setNewStatus(row.status);
                setCancelReason('');
              }}
            >
              Statut
            </Button>
          </Can>
          <Can permission="appointment:update">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Modifier le rendez-vous"
              onClick={() => setFormTarget(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Link to={`/admin/patients/${row.patient_id}`}>
            <Button size="sm" variant="ghost">
              Dossier
            </Button>
          </Link>
          <Can permission="appointment:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer le rendez-vous"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = appointmentsQuery.data?.meta;
  const statusOptions = APPOINTMENT_STATUSES.map((status) => ({
    value: status,
    label: APPOINTMENT_STATUS_LABELS_FR[status],
  }));
  const typeOptions = APPOINTMENT_TYPES.map((type) => ({
    value: type,
    label: APPOINTMENT_TYPE_LABELS_FR[type],
  }));

  return (
    <div className="space-y-5">
      <Header
        title="Rendez-vous"
        subtitle="Planifiez, confirmez et suivez l’ensemble des consultations de la clinique."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void appointmentsQuery.refetch()}
            >
              Actualiser
            </Button>
            <Can permission="appointment:create">
              <Button size="sm" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Nouveau rendez-vous
              </Button>
            </Can>
          </>
        }
      />

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Patient ou motif…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un rendez-vous"
          />
          <Select
            options={statusOptions}
            placeholder="Tous les statuts"
            value={String(filters.status ?? '')}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Filtrer par statut"
          />
          <Select
            options={typeOptions}
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

      {/* Tableau */}
      <Card>
        <DataTable
          columns={columns}
          data={appointmentsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={appointmentsQuery.isLoading}
          isError={appointmentsQuery.isError}
          errorMessage={getApiErrorMessage(appointmentsQuery.error)}
          onRetry={() => void appointmentsQuery.refetch()}
          emptyTitle="Aucun rendez-vous"
          emptyDescription="Aucun rendez-vous ne correspond aux filtres sélectionnés."
          emptyAction={
            <Can permission="appointment:create">
              <Button size="sm" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Créer un rendez-vous
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

      {/* Modale de changement de statut */}
      <Modal
        isOpen={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title="Changer le statut du rendez-vous"
        description={
          statusTarget
            ? `${statusTarget.patient_name ?? 'Patient'} — ${formatDateTime(statusTarget.scheduled_at)}`
            : undefined
        }
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
            options={statusOptions}
            value={newStatus}
            onChange={(event) => setNewStatus(event.target.value as AppointmentStatus)}
          />
          {newStatus === 'CANCELLED' && (
            <Textarea
              label="Motif d’annulation"
              required
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              hint="Ce motif sera conservé dans le dossier du patient."
            />
          )}
        </div>
      </Modal>

      <AppointmentFormModal
        isOpen={formTarget !== null}
        appointment={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        doctors={doctorsQuery.data?.data ?? []}
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
        title="Supprimer ce rendez-vous ?"
        message={
          <>
            Le rendez-vous de{' '}
            <span className="font-semibold">{deleteTarget?.patient_name ?? 'ce patient'}</span> prévu le{' '}
            <span className="font-semibold">
              {deleteTarget ? formatDateTime(deleteTarget.scheduled_at) : ''}
            </span>{' '}
            sera définitivement supprimé.
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

function AppointmentFormModal({
  isOpen,
  appointment,
  doctors,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  appointment?: Appointment;
  doctors: Doctor[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [values, setValues] = useState({
    doctorId: '',
    scheduledAt: '',
    duration: '30',
    type: 'IN_PERSON',
    status: 'SCHEDULED',
    reason: '',
    notes: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setPatient(null);
    if (appointment) {
      setValues({
        doctorId: String(appointment.doctor_id),
        scheduledAt: toDateTimeInput(appointment.scheduled_at),
        duration: String(appointment.duration),
        type: appointment.type,
        status: appointment.status,
        reason: appointment.reason ?? '',
        notes: appointment.notes ?? '',
      });
    } else {
      setValues({
        doctorId: '',
        scheduledAt: '',
        duration: '30',
        type: 'IN_PERSON',
        status: 'SCHEDULED',
        reason: '',
        notes: '',
      });
    }
  }, [isOpen, appointment]);

  const handleSubmit = (): void => {
    if (!appointment && !patient) {
      toast.error('Sélectionnez un patient.');
      return;
    }
    if (!values.doctorId || !values.scheduledAt) {
      toast.error('Médecin et date sont obligatoires.');
      return;
    }

    const base = {
      doctorId: Number(values.doctorId),
      scheduledAt: values.scheduledAt.replace('T', ' '),
      duration: Number(values.duration),
      type: values.type,
      reason: values.reason.trim() || undefined,
      notes: values.notes.trim() || undefined,
    };

    if (appointment) {
      onSubmit({ ...base, status: values.status });
    } else {
      onSubmit({ ...base, patientId: patient!.id });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={appointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
      description="Le créneau est vérifié automatiquement : aucun double booking n’est possible."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {appointment ? 'Enregistrer' : 'Créer le rendez-vous'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {appointment ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Patient
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              {appointment.patient_name ?? `Dossier #${appointment.patient_id}`}
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

        <Select
          label="Médecin"
          required
          placeholder="Choisir un praticien"
          options={doctors.map((doctor) => ({
            value: doctor.id,
            label: `Dr ${doctor.first_name} ${doctor.last_name} — ${doctor.specialty_name ?? ''}`,
          }))}
          value={values.doctorId}
          onChange={(event) => setValues({ ...values, doctorId: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Date et heure"
            type="datetime-local"
            required
            value={values.scheduledAt}
            onChange={(event) => setValues({ ...values, scheduledAt: event.target.value })}
          />
          <Select
            label="Durée"
            options={[
              { value: '15', label: '15 minutes' },
              { value: '20', label: '20 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '45', label: '45 minutes' },
              { value: '60', label: '1 heure' },
            ]}
            value={values.duration}
            onChange={(event) => setValues({ ...values, duration: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Type de consultation"
            options={APPOINTMENT_TYPES.map((type) => ({
              value: type,
              label: APPOINTMENT_TYPE_LABELS_FR[type],
            }))}
            value={values.type}
            onChange={(event) => setValues({ ...values, type: event.target.value })}
            hint="Une téléconsultation crée automatiquement une demande de visioconférence."
          />
          {appointment && (
            <Select
              label="Statut"
              options={NEXT_STATUSES.map((status) => ({
                value: status,
                label: APPOINTMENT_STATUS_LABELS_FR[status],
              }))}
              value={values.status}
              onChange={(event) => setValues({ ...values, status: event.target.value })}
            />
          )}
        </div>

        <Textarea
          label="Motif"
          rows={2}
          value={values.reason}
          onChange={(event) => setValues({ ...values, reason: event.target.value })}
        />

        <Textarea
          label="Notes internes"
          rows={2}
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </div>
    </Modal>
  );
}

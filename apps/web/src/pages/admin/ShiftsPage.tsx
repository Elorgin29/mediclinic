/**
 * Planning des gardes (back-office).
 *
 * Vue calendrier mensuelle : chaque jour affiche les gardes planifiées, avec la
 * couleur du médecin et le type de garde (jour, nuit, astreinte). Le planning
 * peut être exporté en PDF.
 */

import {
  formatDate,
  SHIFT_STATUS_LABELS_FR,
  SHIFT_STATUSES,
  SHIFT_TYPE_LABELS_FR,
  SHIFT_TYPES,
  type Department,
  type Doctor,
  type Paginated,
  type ShiftCalendarEntry,
  type ShiftStatus,
} from '@mediclinic/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Input,
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';
import { cn, doctorColor } from '@/lib/utils';

interface ShiftCalendarResponse {
  from: string;
  to: string;
  days: Array<{ date: string; shifts: ShiftCalendarEntry[] }>;
  byDoctor: Array<{
    doctorId: number;
    doctorName: string;
    color: string;
    shiftCount: number;
    hours: number;
  }>;
}

/** Premier jour du mois au format `AAAA-MM-JJ`. */
function monthStart(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Dernier jour du mois au format `AAAA-MM-JJ`. */
function monthEnd(date: Date): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(
    last.getDate(),
  ).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export default function ShiftsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(() => new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShiftCalendarEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShiftCalendarEntry | null>(null);

  const from = monthStart(cursor);
  const to = monthEnd(cursor);

  const calendarQuery = useQuery({
    queryKey: queryKeys.shifts.calendar(from, to),
    queryFn: () => apiGet<ShiftCalendarResponse>(`/shifts/calendar?from=${from}&to=${to}`),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Doctor>>('/doctors?limit=100'),
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.all,
    queryFn: () => apiGet<Department[]>('/departments'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<unknown>('/shifts', payload),
    onSuccess: () => {
      toast.success('Garde planifiée.');
      setIsCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<unknown>(`/shifts/${id}`, payload),
    onSuccess: () => {
      toast.success('Garde mise à jour.');
      setEditTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/shifts/${id}`),
    onSuccess: () => {
      toast.success('Garde supprimée.');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  /** Regroupe les gardes par date pour l'affichage en grille. */
  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftCalendarEntry[]>();
    for (const day of calendarQuery.data?.days ?? []) {
      map.set(day.date, day.shifts);
    }
    return map;
  }, [calendarQuery.data]);

  /** Grille du mois : cases vides avant le 1er, puis les jours. */
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    // La semaine commence le lundi (0 = lundi dans cette grille).
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    const cells: Array<{ date: string | null; dayNumber: number | null }> = [];
    for (let index = 0; index < offset; index += 1) cells.push({ date: null, dayNumber: null });

    for (let day = 1; day <= daysInMonth; day += 1) {
      const month = String(cursor.getMonth() + 1).padStart(2, '0');
      cells.push({
        date: `${cursor.getFullYear()}-${month}-${String(day).padStart(2, '0')}`,
        dayNumber: day,
      });
    }
    return cells;
  }, [cursor]);

  const move = (delta: number): void => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planning des gardes"
        subtitle="Organisation des gardes de jour, de nuit et des astreintes par département."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => void downloadPdf(`/pdf/shifts/planning?from=${from}&to=${to}`)}
            >
              Planning PDF
            </Button>
            <Can permission="shift:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
                Nouvelle garde
              </Button>
            </Can>
          </>
        }
      />

      {/* Navigation mensuelle */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => move(-1)} aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[180px] text-center text-sm font-semibold capitalize text-slate-900 dark:text-white">
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </p>
          <Button variant="secondary" size="icon" onClick={() => move(1)} aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            Aujourd’hui
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {calendarQuery.isFetching && <Spinner className="h-3.5 w-3.5" />}
          {calendarQuery.data?.days.reduce((sum, day) => sum + day.shifts.length, 0) ?? 0} garde(s) sur la
          période
        </div>
      </Card>

      {calendarQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(calendarQuery.error)}
            onRetry={() => void calendarQuery.refetch()}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* En-têtes de jours */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center dark:border-slate-800 dark:bg-slate-900">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label) => (
              <div
                key={label}
                className="py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grille */}
          <div className="grid grid-cols-7">
            {grid.map((cell, index) => {
              const shifts = cell.date ? (shiftsByDate.get(cell.date) ?? []) : [];
              const isToday = cell.date === todayISO;
              const isWeekend = index % 7 >= 5;

              return (
                <div
                  key={cell.date ?? `empty-${index}`}
                  className={cn(
                    'min-h-[104px] border-b border-r border-slate-100 p-1.5 dark:border-slate-800',
                    cell.date === null && 'bg-slate-50/60 dark:bg-slate-900/40',
                    isWeekend && cell.date !== null && 'bg-slate-50/40 dark:bg-slate-900/30',
                  )}
                >
                  {cell.dayNumber !== null && (
                    <>
                      <p
                        className={cn(
                          'mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                          isToday
                            ? 'bg-brand-700 text-white'
                            : 'text-slate-600 dark:text-slate-300',
                        )}
                      >
                        {cell.dayNumber}
                      </p>

                      <div className="space-y-1">
                        {shifts.slice(0, 3).map((shift) => (
                          <button
                            key={shift.id}
                            type="button"
                            onClick={() => setEditTarget(shift)}
                            className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
                            style={{ backgroundColor: doctorColor(shift.doctor_id) }}
                            title={`${shift.doctor_name} — ${SHIFT_TYPE_LABELS_FR[shift.type]} ${shift.start_time}-${shift.end_time}`}
                          >
                            {shift.start_time} {shift.doctor_name?.replace('Dr ', '') ?? ''}
                          </button>
                        ))}
                        {shifts.length > 3 && (
                          <p className="px-1 text-[10px] text-slate-400">+{shifts.length - 3} autre(s)</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Récapitulatif par médecin */}
      {(calendarQuery.data?.byDoctor ?? []).length > 0 && (
        <Card className="p-5">
          <h2 className="section-title">Charge par médecin</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(calendarQuery.data?.byDoctor ?? []).map((doctor) => (
              <div
                key={doctor.doctorId}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: doctorColor(doctor.doctorId) }}
                    aria-hidden
                  />
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{doctor.doctorName}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {doctor.shiftCount} garde(s) · {doctor.hours} h
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Légende */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Légende
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(SHIFT_TYPE_LABELS_FR).map(([type, label]) => (
            <Badge key={type} tone="neutral">
              {label}
            </Badge>
          ))}
          {Object.entries(SHIFT_STATUS_LABELS_FR).map(([status, label]) => (
            <StatusBadge key={status} kind="shift" status={status} label={label} />
          ))}
        </div>
      </Card>

      <CreateShiftModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        doctors={doctorsQuery.data?.data ?? []}
        departments={departmentsQuery.data ?? []}
        isPending={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />

      <EditShiftModal
        shift={editTarget}
        doctors={doctorsQuery.data?.data ?? []}
        departments={departmentsQuery.data ?? []}
        isPending={updateMutation.isPending}
        onClose={() => setEditTarget(null)}
        onSubmit={(payload) => editTarget && updateMutation.mutate({ id: editTarget.id, payload })}
        onRequestDelete={() => {
          setDeleteTarget(editTarget);
          setEditTarget(null);
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer cette garde ?"
        message={
          <>
            La garde de{' '}
            <span className="font-semibold">{deleteTarget?.doctor_name ?? 'ce médecin'}</span> du{' '}
            <span className="font-semibold">{deleteTarget ? formatDate(deleteTarget.start_at) : ''}</span> sera
            définitivement supprimée du planning.
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
/* Création d'une garde                                                        */
/* -------------------------------------------------------------------------- */

function CreateShiftModal({
  isOpen,
  onClose,
  doctors,
  departments,
  isPending,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  doctors: Doctor[];
  departments: Department[];
  isPending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({
    doctorId: '',
    departmentId: '',
    startAt: '',
    endAt: '',
    type: 'DAY',
    notes: '',
  });

  const handleSubmit = (): void => {
    if (!values.doctorId || !values.departmentId || !values.startAt || !values.endAt) {
      toast.error('Médecin, département, début et fin sont obligatoires.');
      return;
    }
    if (new Date(values.endAt) <= new Date(values.startAt)) {
      toast.error('La fin de garde doit être postérieure au début.');
      return;
    }

    onSubmit({
      doctorId: Number(values.doctorId),
      departmentId: Number(values.departmentId),
      startAt: values.startAt.replace('T', ' '),
      endAt: values.endAt.replace('T', ' '),
      type: values.type,
      notes: values.notes.trim() || null,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Planifier une garde"
      description="Les chevauchements avec une autre garde du même médecin sont refusés automatiquement."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} leftIcon={<CalendarClock className="h-4 w-4" />}>
            Planifier
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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

        <Select
          label="Département"
          required
          placeholder="Choisir un département"
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
          }))}
          value={values.departmentId}
          onChange={(event) => setValues({ ...values, departmentId: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Début"
            type="datetime-local"
            required
            value={values.startAt}
            onChange={(event) => setValues({ ...values, startAt: event.target.value })}
          />
          <Input
            label="Fin"
            type="datetime-local"
            required
            value={values.endAt}
            onChange={(event) => setValues({ ...values, endAt: event.target.value })}
          />
        </div>

        <Select
          label="Type de garde"
          options={Object.entries(SHIFT_TYPE_LABELS_FR).map(([value, label]) => ({ value, label }))}
          value={values.type}
          onChange={(event) => setValues({ ...values, type: event.target.value })}
        />

        <Textarea
          label="Notes"
          rows={2}
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Modification d'une garde                                                    */
/* -------------------------------------------------------------------------- */

/** Convertit un horodatage API en valeur d'un `<input type="datetime-local">`. */
function toDateTimeInput(value: string): string {
  return value.includes('T') ? value.slice(0, 16) : value.replace(' ', 'T').slice(0, 16);
}

function EditShiftModal({
  shift,
  doctors,
  departments,
  isPending,
  onClose,
  onSubmit,
  onRequestDelete,
}: {
  shift: ShiftCalendarEntry | null;
  doctors: Doctor[];
  departments: Department[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  onRequestDelete: () => void;
}): JSX.Element {
  const [values, setValues] = useState({
    doctorId: '',
    departmentId: '',
    startAt: '',
    endAt: '',
    type: 'DAY',
    status: 'SCHEDULED' as ShiftStatus,
    notes: '',
  });

  useEffect(() => {
    if (!shift) return;
    setValues({
      doctorId: String(shift.doctor_id),
      departmentId: String(shift.department_id),
      startAt: toDateTimeInput(shift.start_at),
      endAt: toDateTimeInput(shift.end_at),
      type: shift.type,
      status: shift.status,
      notes: shift.notes ?? '',
    });
  }, [shift]);

  const handleSubmit = (): void => {
    if (!values.doctorId || !values.departmentId || !values.startAt || !values.endAt) {
      toast.error('Médecin, département, début et fin sont obligatoires.');
      return;
    }
    if (new Date(values.endAt) <= new Date(values.startAt)) {
      toast.error('La fin de garde doit être postérieure au début.');
      return;
    }

    onSubmit({
      doctorId: Number(values.doctorId),
      departmentId: Number(values.departmentId),
      startAt: values.startAt.replace('T', ' '),
      endAt: values.endAt.replace('T', ' '),
      type: values.type,
      status: values.status,
      notes: values.notes.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={shift !== null}
      onClose={onClose}
      title="Modifier la garde"
      description={
        shift ? `${shift.doctor_name ?? 'Médecin'} — ${SHIFT_TYPE_LABELS_FR[shift.type]}` : undefined
      }
      isBusy={isPending}
      footer={
        <>
          <Can permission="shift:delete">
            <Button
              variant="ghost"
              className="mr-auto text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={onRequestDelete}
            >
              Supprimer
            </Button>
          </Can>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Médecin"
          required
          options={doctors.map((doctor) => ({
            value: doctor.id,
            label: `Dr ${doctor.first_name} ${doctor.last_name} — ${doctor.specialty_name ?? ''}`,
          }))}
          value={values.doctorId}
          onChange={(event) => setValues({ ...values, doctorId: event.target.value })}
        />

        <Select
          label="Département"
          required
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
          }))}
          value={values.departmentId}
          onChange={(event) => setValues({ ...values, departmentId: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Début"
            type="datetime-local"
            required
            value={values.startAt}
            onChange={(event) => setValues({ ...values, startAt: event.target.value })}
          />
          <Input
            label="Fin"
            type="datetime-local"
            required
            value={values.endAt}
            onChange={(event) => setValues({ ...values, endAt: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Type de garde"
            options={SHIFT_TYPES.map((type) => ({
              value: type,
              label: SHIFT_TYPE_LABELS_FR[type],
            }))}
            value={values.type}
            onChange={(event) => setValues({ ...values, type: event.target.value })}
          />
          <Select
            label="Statut"
            options={SHIFT_STATUSES.map((status) => ({
              value: status,
              label: SHIFT_STATUS_LABELS_FR[status],
            }))}
            value={values.status}
            onChange={(event) => setValues({ ...values, status: event.target.value as ShiftStatus })}
          />
        </div>

        <Textarea
          label="Notes"
          rows={2}
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </div>
    </Modal>
  );
}

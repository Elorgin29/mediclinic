/**
 * Mes rendez-vous (espace patient).
 *
 * Liste des rendez-vous du patient connecté, avec possibilité d'annuler un
 * rendez-vous à venir et d'en prendre un nouveau.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  APPOINTMENT_TYPE_LABELS_FR,
  formatDateTime,
  type Appointment,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Spinner,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, apiPatch, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

/** Un rendez-vous est-il encore modifiable (à venir, ni annulé ni terminé) ? */
function isUpcoming(appointment: Appointment): boolean {
  const start = new Date(appointment.scheduled_at.replace(' ', 'T')).getTime();
  return start > Date.now() && appointment.status !== 'CANCELLED' && appointment.status !== 'COMPLETED';
}

export default function PatientAppointmentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('upcoming');
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  const appointmentsQuery = useQuery({
    queryKey: queryKeys.appointments.me,
    queryFn: () => apiGet<Appointment[]>('/appointments/me'),
  });

  const cancelMutation = useMutation({
    mutationFn: (appointmentId: number) =>
      apiPatch<Appointment>(`/appointments/${appointmentId}/status`, {
        status: 'CANCELLED',
        cancelledReason: 'Annulé par le patient depuis son espace',
      }),
    onSuccess: () => {
      toast.success('Rendez-vous annulé.');
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const appointments = appointmentsQuery.data ?? [];
  const upcoming = appointments.filter(isUpcoming);
  const past = appointments.filter((item) => !isUpcoming(item));
  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mes rendez-vous"
        subtitle="Consultez vos rendez-vous à venir et votre historique de consultation."
        actions={
          <Link to="/rendez-vous">
            <Button size="sm" leftIcon={<CalendarPlus className="h-4 w-4" />}>
              Prendre rendez-vous
            </Button>
          </Link>
        }
      />

      <Tabs
        items={[
          { id: 'upcoming', label: 'À venir', count: upcoming.length },
          { id: 'past', label: 'Historique', count: past.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {appointmentsQuery.isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      ) : appointmentsQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(appointmentsQuery.error)}
            onRetry={() => void appointmentsQuery.refetch()}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck}
            title={tab === 'upcoming' ? 'Aucun rendez-vous à venir' : 'Aucun rendez-vous passé'}
            description={
              tab === 'upcoming'
                ? 'Réservez votre prochaine consultation en quelques clics.'
                : 'Votre historique apparaîtra ici après votre première consultation.'
            }
            action={
              tab === 'upcoming' ? (
                <Link to="/rendez-vous">
                  <Button size="sm">Prendre rendez-vous</Button>
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((appointment) => (
            <Card key={appointment.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    {formatDateTime(appointment.scheduled_at)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {appointment.doctor_name ?? 'Médecin'} ·{' '}
                    {appointment.department_name ?? 'Consultation'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {APPOINTMENT_TYPE_LABELS_FR[appointment.type]} · {appointment.duration} minutes
                  </p>
                  {appointment.reason && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Motif : {appointment.reason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    kind="appointment"
                    status={appointment.status}
                    label={APPOINTMENT_STATUS_LABELS_FR[appointment.status]}
                  />
                  {isUpcoming(appointment) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      leftIcon={<X className="h-3.5 w-3.5" />}
                      onClick={() => setCancelTarget(appointment)}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={cancelTarget !== null}
        title="Annuler ce rendez-vous ?"
        message={
          cancelTarget
            ? `Le rendez-vous du ${formatDateTime(cancelTarget.scheduled_at)} avec ${
                cancelTarget.doctor_name ?? 'votre médecin'
              } sera annulé. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Annuler le rendez-vous"
        cancelLabel="Conserver"
        isLoading={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

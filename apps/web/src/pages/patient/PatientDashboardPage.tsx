/**
 * Tableau de bord du patient.
 *
 * Synthèse de son parcours : prochain rendez-vous, ordonnances récentes,
 * factures à régler et téléconsultations à venir.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  formatDate,
  formatDateTime,
  formatMoney,
  INVOICE_STATUS_LABELS_FR,
  MEETING_STATUS_LABELS_FR,
  type Appointment,
  type Invoice,
  type Meeting,
  type Paginated,
  type Patient,
  type Prescription,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, FileText, Receipt, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardsSkeleton,
  EmptyState,
  ErrorState,
  StatusBadge,
  StatCard,
} from '@/components/ui';
import { apiGet, apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

/** Prochain rendez-vous à venir parmi une liste. */
function nextAppointment(appointments: Appointment[]): Appointment | null {
  const now = Date.now();
  return (
    appointments
      .filter((item) => new Date(item.scheduled_at.replace(' ', 'T')).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.scheduled_at.replace(' ', 'T')).getTime() -
          new Date(b.scheduled_at.replace(' ', 'T')).getTime(),
      )[0] ?? null
  );
}

export default function PatientDashboardPage(): JSX.Element {
  const { user } = useAuth();

  const patientQuery = useQuery({
    queryKey: queryKeys.patients.me,
    queryFn: () => apiGet<Patient>('/patients/me'),
  });

  const appointmentsQuery = useQuery({
    queryKey: queryKeys.appointments.me,
    queryFn: () => apiGet<Appointment[]>('/appointments/me'),
  });

  const prescriptionsQuery = useQuery({
    queryKey: queryKeys.prescriptions.all({ patientId: user?.patient_id, limit: 5 }),
    queryFn: () => apiGetRaw<Paginated<Prescription>>('/prescriptions/me?limit=5'),
  });

  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices.me,
    queryFn: () => apiGetRaw<Paginated<Invoice>>('/invoices/me'),
  });

  const meetingsQuery = useQuery({
    queryKey: queryKeys.meetings.me,
    queryFn: () => apiGetRaw<Paginated<Meeting>>('/meetings/me'),
  });

  const isLoading =
    patientQuery.isLoading || appointmentsQuery.isLoading || invoicesQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Bonjour {user?.first_name}</h1>
        <CardsSkeleton count={4} />
      </div>
    );
  }

  const failedQuery = [
    patientQuery,
    appointmentsQuery,
    prescriptionsQuery,
    invoicesQuery,
    meetingsQuery,
  ].find((query) => query.isError);
  if (failedQuery) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Bonjour {user?.first_name}</h1>
        <Card>
          <ErrorState
            message={getApiErrorMessage(failedQuery.error)}
            onRetry={() => void failedQuery.refetch()}
          />
        </Card>
      </div>
    );
  }

  const appointments = appointmentsQuery.data ?? [];
  const invoices = invoicesQuery.data?.data ?? [];
  const upcoming = nextAppointment(appointments);
  const unpaid = invoices.filter((invoice) => invoice.status !== 'PAID' && invoice.status !== 'CANCELLED');
  const outstanding = unpaid.reduce(
    (sum, invoice) => sum + (Number(invoice.total_amount) - Number(invoice.paid_amount)),
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Bonjour {user?.first_name}</h1>
          <p className="page-subtitle">
            {patientQuery.data
              ? `Dossier n° ${patientQuery.data.id} — ${patientQuery.data.first_name} ${patientQuery.data.last_name}`
              : 'Votre espace santé'}
          </p>
        </div>
        <Link to="/patient/rendez-vous">
          <Button leftIcon={<CalendarCheck className="h-4 w-4" />}>Prendre rendez-vous</Button>
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rendez-vous à venir"
          value={
            appointments.filter(
              (item) => new Date(item.scheduled_at.replace(' ', 'T')).getTime() >= Date.now(),
            ).length
          }
          icon={CalendarCheck}
          tone="brand"
        />
        <StatCard label="Ordonnances" value={prescriptionsQuery.data?.data?.length ?? 0} icon={FileText} tone="info" />
        <StatCard
          label="Factures à régler"
          value={unpaid.length}
          hint={outstanding > 0 ? formatMoney(outstanding) : 'À jour'}
          icon={Receipt}
          tone={unpaid.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Téléconsultations"
          value={(meetingsQuery.data?.data ?? []).filter((item) => item.status === 'APPROVED').length}
          icon={Video}
          tone="brand"
        />
      </div>

      {/* Prochain rendez-vous */}
      <Card>
        <CardHeader
          title="Prochain rendez-vous"
          actions={
            <Link to="/patient/rendez-vous">
              <Button variant="ghost" size="sm">
                Tout voir
              </Button>
            </Link>
          }
        />
        <CardBody>
          {upcoming ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {formatDateTime(upcoming.scheduled_at)}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {upcoming.doctor_name ?? 'Médecin'} · {upcoming.department_name ?? upcoming.reason ?? 'Consultation'}
                </p>
              </div>
              <StatusBadge
                kind="appointment"
                status={upcoming.status}
                label={APPOINTMENT_STATUS_LABELS_FR[upcoming.status]}
              />
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="Aucun rendez-vous à venir"
              description="Réservez une consultation en ligne en quelques clics."
              action={
                <Link to="/patient/rendez-vous">
                  <Button size="sm">Prendre rendez-vous</Button>
                </Link>
              }
            />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ordonnances */}
        <Card>
          <CardHeader
            title="Ordonnances récentes"
            actions={
              <Link to="/patient/ordonnances">
                <Button variant="ghost" size="sm">
                  Tout voir
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            {(prescriptionsQuery.data?.data?.length ?? 0) === 0 ? (
              <EmptyState icon={FileText} title="Aucune ordonnance" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(prescriptionsQuery.data?.data ?? []).slice(0, 5).map((prescription) => (
                  <li key={prescription.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Ordonnance #{prescription.id}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {prescription.doctor_name ?? 'Médecin'} · {formatDate(prescription.issued_at)}
                      </p>
                    </div>
                    <StatusBadge
                      kind="prescription"
                      status={prescription.status}
                      label={prescription.status === 'DISPENSED' ? 'Dispensée' : prescription.status === 'ISSUED' ? 'Émise' : 'Annulée'}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Factures */}
        <Card>
          <CardHeader
            title="Factures"
            actions={
              <Link to="/patient/factures">
                <Button variant="ghost" size="sm">
                  Tout voir
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            {invoices.length === 0 ? (
              <EmptyState icon={Receipt} title="Aucune facture" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.slice(0, 5).map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{invoice.number}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Échéance {formatDate(invoice.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatMoney(invoice.total_amount)}
                      </p>
                      <StatusBadge
                        kind="invoice"
                        status={invoice.status}
                        label={INVOICE_STATUS_LABELS_FR[invoice.status]}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Téléconsultations */}
      {(meetingsQuery.data?.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Mes téléconsultations" description="Lien de connexion disponible 10 minutes avant la séance" />
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(meetingsQuery.data?.data ?? []).slice(0, 4).map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {meeting.doctor_name ?? 'Médecin'}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{meeting.reason}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(meeting.start_time ?? meeting.preferred_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      kind="meeting"
                      status={meeting.status}
                      label={MEETING_STATUS_LABELS_FR[meeting.status]}
                    />
                    {meeting.status === 'APPROVED' && (
                      <Link to="/patient/teleconsultations">
                        <Button size="sm" variant="outline">
                          Rejoindre
                        </Button>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

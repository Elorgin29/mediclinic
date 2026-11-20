/**
 * Fiche patient détaillée (back-office).
 *
 * Onglets : identité et antécédents, chronologie complète du dossier,
 * rendez-vous, consultations, ordonnances et factures. Le dossier PDF est
 * téléchargeable depuis l'en-tête.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  formatAge,
  formatDate,
  formatDateTime,
  formatMoney,
  INVOICE_STATUS_LABELS_FR,
  type Appointment,
  type Consultation,
  type Invoice,
  type Patient,
  type Prescription,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Download,
  Droplet,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  SkeletonText,
  StatusBadge,
  Tabs,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';

/** Entrée de la chronologie consolidée renvoyée par l'API. */
interface TimelineEntry {
  entry_type: string;
  entry_id: number;
  event_date: string;
  title: string;
  description: string;
}

interface PatientHistoryResponse {
  patient: Patient;
  appointments: Appointment[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  invoices: Invoice[];
  timeline: TimelineEntry[];
}

const TIMELINE_LABELS: Record<string, string> = {
  APPOINTMENT: 'Rendez-vous',
  CONSULTATION: 'Consultation',
  PRESCRIPTION: 'Ordonnance',
  INVOICE: 'Facture',
  LAB_REQUEST: 'Analyse',
};

export default function PatientDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const patientId = Number(id);
  const [tab, setTab] = useState('chronologie');

  const historyQuery = useQuery({
    queryKey: queryKeys.patients.history(patientId),
    queryFn: () => apiGet<PatientHistoryResponse>(`/patients/${patientId}/history`),
    enabled: Number.isFinite(patientId),
  });

  if (historyQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dossier patient" />
        <Card className="p-6">
          <SkeletonText lines={6} />
        </Card>
      </div>
    );
  }

  if (historyQuery.isError || !historyQuery.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dossier patient" />
        <Card>
          <ErrorState
            message={getApiErrorMessage(historyQuery.error)}
            onRetry={() => void historyQuery.refetch()}
          />
        </Card>
      </div>
    );
  }

  const { patient, appointments, consultations, prescriptions, invoices, timeline } = historyQuery.data;

  const tabs = [
    { id: 'chronologie', label: 'Chronologie', count: timeline.length },
    { id: 'rendez-vous', label: 'Rendez-vous', count: appointments.length },
    { id: 'consultations', label: 'Consultations', count: consultations.length },
    { id: 'ordonnances', label: 'Ordonnances', count: prescriptions.length },
    { id: 'factures', label: 'Factures', count: invoices.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle={`Dossier #${patient.id} · ${formatAge(patient.birth_date)} · ${
          patient.gender === 'FEMALE' ? 'Femme' : patient.gender === 'MALE' ? 'Homme' : 'Autre'
        }`}
        breadcrumb={
          <Link to="/admin/patients" className="link">
            ← Retour à la liste des patients
          </Link>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => void downloadPdf(`/pdf/patient/${patient.id}`)}
          >
            Dossier PDF
          </Button>
        }
      />

      {/* Identité */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {patient.first_name.charAt(0)}
              {patient.last_name.charAt(0)}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {patient.last_name.toUpperCase()} {patient.first_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Né(e) le {formatDate(patient.birth_date)}
              </p>
            </div>
          </div>

          <dl className="mt-4 space-y-2.5 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
            {patient.phone && (
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dd className="text-slate-700 dark:text-slate-200">{patient.phone}</dd>
              </div>
            )}
            {patient.email && (
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dd className="break-all text-slate-700 dark:text-slate-200">{patient.email}</dd>
              </div>
            )}
            {(patient.address || patient.city) && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <dd className="text-slate-700 dark:text-slate-200">
                  {patient.address}
                  {patient.address && patient.city ? ', ' : ''}
                  {patient.postal_code} {patient.city}
                </dd>
              </div>
            )}
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <dd className="text-slate-700 dark:text-slate-200">
                Assurance : {patient.insurance_number ?? 'non renseignée'}
              </dd>
            </div>
            <div className="flex items-start gap-2">
              <Droplet className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
              <dd className="text-slate-700 dark:text-slate-200">
                Groupe sanguin : <span className="font-semibold">{patient.blood_group ?? 'inconnu'}</span>
              </dd>
            </div>
          </dl>

          {patient.allergies && (
            <div className="mt-4 rounded-lg bg-rose-50 p-3 dark:bg-rose-950/50">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 dark:text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Allergies
              </p>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{patient.allergies}</p>
            </div>
          )}

          {patient.medical_history && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Antécédents</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{patient.medical_history}</p>
            </div>
          )}

          {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                Contact d’urgence
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {patient.emergency_contact_name ?? '—'} · {patient.emergency_contact_phone ?? '—'}
              </p>
            </div>
          )}
        </Card>

        {/* Onglets */}
        <Card>
          <div className="px-5 pt-4">
            <Tabs items={tabs} value={tab} onChange={setTab} />
          </div>

          <CardBody>
            {tab === 'chronologie' && (
              <TimelineList entries={timeline} />
            )}

            {tab === 'rendez-vous' && (
              <SimpleList
                empty="Aucun rendez-vous enregistré."
                items={appointments.map((item) => ({
                  id: item.id,
                  title: formatDateTime(item.scheduled_at),
                  subtitle: `${item.doctor_name ?? 'Médecin'} · ${item.reason ?? 'Sans motif'}`,
                  badge: (
                    <StatusBadge
                      kind="appointment"
                      status={item.status}
                      label={APPOINTMENT_STATUS_LABELS_FR[item.status]}
                    />
                  ),
                }))}
              />
            )}

            {tab === 'consultations' && (
              <SimpleList
                empty="Aucune consultation enregistrée."
                items={consultations.map((item) => ({
                  id: item.id,
                  title: formatDateTime(item.created_at),
                  subtitle: `${item.doctor_name ?? 'Médecin'} — ${item.diagnosis}`,
                  badge: (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Download className="h-3.5 w-3.5" />}
                      onClick={() => void downloadPdf(`/pdf/consultation/${item.id}`)}
                    >
                      PDF
                    </Button>
                  ),
                }))}
              />
            )}

            {tab === 'ordonnances' && (
              <SimpleList
                empty="Aucune ordonnance."
                items={prescriptions.map((item) => ({
                  id: item.id,
                  title: `Ordonnance #${item.id}`,
                  subtitle: `${item.doctor_name ?? 'Médecin'} · ${formatDate(item.issued_at)}`,
                  badge: (
                    <div className="flex items-center gap-1">
                      <StatusBadge
                        kind="prescription"
                        status={item.status}
                        label={
                          item.status === 'DISPENSED' ? 'Dispensée' : item.status === 'ISSUED' ? 'Émise' : 'Annulée'
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Télécharger l'ordonnance"
                        onClick={() => void downloadPdf(`/pdf/prescription/${item.id}`)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                }))}
              />
            )}

            {tab === 'factures' && (
              <SimpleList
                empty="Aucune facture."
                items={invoices.map((item) => ({
                  id: item.id,
                  title: item.number,
                  subtitle: `${formatDate(item.issued_at)} · ${formatMoney(item.total_amount)}`,
                  badge: (
                    <StatusBadge
                      kind="invoice"
                      status={item.status}
                      label={INVOICE_STATUS_LABELS_FR[item.status]}
                    />
                  ),
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sous-composants                                                             */
/* -------------------------------------------------------------------------- */

function TimelineList({ entries }: { entries: TimelineEntry[] }): JSX.Element {
  if (entries.length === 0) {
    return <EmptyState icon={Calendar} title="Aucun événement" description="Le dossier est encore vide." />;
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
      {entries.map((entry) => (
        <li key={`${entry.entry_type}-${entry.entry_id}`} className="relative">
          <span
            className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-white dark:ring-slate-900"
            aria-hidden
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{TIMELINE_LABELS[entry.entry_type] ?? entry.entry_type}</Badge>
            <span className="text-xs text-slate-400">{formatDate(entry.event_date)}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{entry.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{entry.description}</p>
        </li>
      ))}
    </ol>
  );
}

function SimpleList({
  items,
  empty,
}: {
  items: Array<{ id: number; title: string; subtitle: string; badge?: React.ReactNode }>;
  empty: string;
}): JSX.Element {
  if (items.length === 0) {
    return <EmptyState title={empty} />;
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
          </div>
          {item.badge}
        </li>
      ))}
    </ul>
  );
}

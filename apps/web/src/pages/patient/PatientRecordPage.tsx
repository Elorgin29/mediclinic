/**
 * Mon dossier médical (espace patient).
 *
 * Identité, groupe sanguin, allergies, antécédents et chronologie complète des
 * événements de santé. Le dossier est téléchargeable en PDF.
 */

import {
  formatAge,
  formatDate,
  formatDateTime,
  type Appointment,
  type Consultation,
  type Invoice,
  type Patient,
  type Prescription,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Droplet, FileText, HeartPulse, ShieldAlert } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  SkeletonText,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';

/** Réponse de `GET /api/patients/:id/history`. */
interface PatientHistoryResponse {
  patient: Patient;
  appointments: Appointment[];
  consultations: Consultation[];
  prescriptions: Prescription[];
  invoices: Invoice[];
  timeline: Array<{
    entry_type: string;
    entry_id: number;
    event_date: string;
    title: string;
    description: string;
  }>;
}

const TIMELINE_LABELS: Record<string, string> = {
  APPOINTMENT: 'Rendez-vous',
  CONSULTATION: 'Consultation',
  PRESCRIPTION: 'Ordonnance',
  INVOICE: 'Facture',
  LAB_REQUEST: 'Analyse',
};

export default function PatientRecordPage(): JSX.Element {
  const meQuery = useQuery({
    queryKey: queryKeys.patients.me,
    queryFn: () => apiGet<Patient>('/patients/me'),
  });

  const patientId = meQuery.data?.id;

  const historyQuery = useQuery({
    queryKey: queryKeys.patients.history(patientId ?? 0),
    queryFn: () => apiGet<PatientHistoryResponse>(`/patients/${patientId}/history`),
    enabled: typeof patientId === 'number',
  });

  if (meQuery.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Mon dossier médical" />
        <Card className="p-6">
          <SkeletonText lines={6} />
        </Card>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Mon dossier médical" />
        <Card>
          <ErrorState
            message={getApiErrorMessage(meQuery.error)}
            onRetry={() => void meQuery.refetch()}
          />
        </Card>
      </div>
    );
  }

  const patient = meQuery.data;
  const timeline = historyQuery.data?.timeline ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mon dossier médical"
        subtitle={`Dossier n° ${patient.id} — ${patient.first_name} ${patient.last_name}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => void downloadPdf(`/pdf/patient/${patient.id}`)}
          >
            Télécharger mon dossier
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Synthèse */}
        <Card className="self-start p-5">
          <h2 className="section-title">Informations médicales</h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Date de naissance</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {formatDate(patient.birth_date)} ({formatAge(patient.birth_date)})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Genre</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {patient.gender === 'FEMALE' ? 'Femme' : patient.gender === 'MALE' ? 'Homme' : 'Autre'}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <Droplet className="h-4 w-4 text-rose-500" aria-hidden />
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Groupe sanguin</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {patient.blood_group ?? 'Non renseigné'}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">N° d’assurance</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {patient.insurance_number ?? 'Non renseigné'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Téléphone</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{patient.phone ?? '—'}</dd>
            </div>
          </dl>

          {patient.allergies && (
            <div className="mt-4 rounded-lg bg-rose-50 p-3 dark:bg-rose-950/50">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 dark:text-rose-300">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Allergies connues
              </p>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{patient.allergies}</p>
            </div>
          )}

          {patient.medical_history && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <HeartPulse className="h-3.5 w-3.5 text-brand-700 dark:text-brand-400" aria-hidden />
                Antécédents
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{patient.medical_history}</p>
            </div>
          )}

          <p className="mt-4 text-[11px] text-slate-400">
            Ces informations sont renseignées par le personnel soignant. Signalez toute erreur au
            secrétariat.
          </p>
        </Card>

        {/* Chronologie */}
        <Card>
          <CardHeader
            title="Chronologie de mon parcours de soin"
            description={`${timeline.length} événement(s) enregistré(s)`}
          />
          <CardBody>
            {historyQuery.isLoading ? (
              <SkeletonText lines={8} />
            ) : timeline.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucun événement"
                description="Votre historique apparaîtra ici après votre première consultation."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-800">
                {timeline.map((entry) => (
                  <li key={`${entry.entry_type}-${entry.entry_id}`} className="relative">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-white dark:ring-slate-900"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{TIMELINE_LABELS[entry.entry_type] ?? entry.entry_type}</Badge>
                      <span className="text-xs text-slate-400">{formatDateTime(entry.event_date)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{entry.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{entry.description}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

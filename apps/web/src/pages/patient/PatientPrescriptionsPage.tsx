/**
 * Mes ordonnances (espace patient).
 *
 * Chaque ordonnance est consultable en détail et téléchargeable en PDF.
 */

import {
  formatDate,
  PRESCRIPTION_STATUS_LABELS_FR,
  type Paginated,
  type Prescription,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Pill } from 'lucide-react';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';

/** Ordonnance avec ses lignes, telle que renvoyée par l'API. */
type PrescriptionWithItems = Omit<Prescription, 'items'> & {
  items?: Array<{
    id: number;
    medication_name?: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string | null;
    quantity: number;
  }>;
};

export default function PatientPrescriptionsPage(): JSX.Element {
  const { user } = useAuth();

  const prescriptionsQuery = useQuery({
    queryKey: queryKeys.prescriptions.all({ patientId: user?.patient_id }),
    queryFn: () => apiGetRaw<Paginated<PrescriptionWithItems>>('/prescriptions?limit=50'),
  });

  const prescriptions = prescriptionsQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mes ordonnances"
        subtitle="Retrouvez vos prescriptions et téléchargez-les pour la pharmacie."
      />

      {prescriptionsQuery.isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      ) : prescriptionsQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(prescriptionsQuery.error)}
            onRetry={() => void prescriptionsQuery.refetch()}
          />
        </Card>
      ) : prescriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Aucune ordonnance"
            description="Vos ordonnances apparaîtront ici après une consultation."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((prescription) => (
            <Card key={prescription.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ordonnance n° {prescription.id}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {prescription.doctor_name ?? 'Médecin'} · {formatDate(prescription.issued_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    kind="prescription"
                    status={prescription.status}
                    label={PRESCRIPTION_STATUS_LABELS_FR[prescription.status]}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void downloadPdf(`/pdf/prescription/${prescription.id}`)}
                  >
                    PDF
                  </Button>
                </div>
              </div>

              {prescription.items && prescription.items.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {prescription.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <Pill className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {item.medication_name ?? 'Médicament'} × {item.quantity}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.dosage} — {item.frequency} pendant {item.duration}
                        </p>
                        {item.instructions && (
                          <p className="text-xs italic text-slate-400">{item.instructions}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

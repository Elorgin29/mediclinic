/**
 * Ordonnances (back-office).
 *
 * Liste des prescriptions avec leur statut, accès au détail, impression du
 * document et déclenchement de la dispensation par la pharmacie.
 */

import {
  formatDate,
  formatDateTime,
  PRESCRIPTION_STATUS_LABELS_FR,
  PRESCRIPTION_STATUSES,
  type Paginated,
  type Prescription,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Package, Search } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  DataTable,
  Input,
  Pagination,
  Select,
  StatCard,
  StatusBadge,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGetRaw, apiPost, getApiErrorMessage } from '@/lib/apiClient';
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

  const dispenseMutation = useMutation({
    mutationFn: (prescriptionId: number) => apiPost<Prescription>(`/prescriptions/${prescriptionId}/dispense`, {}),
    onSuccess: () => {
      toast.success('Ordonnance dispensée : le stock a été mis à jour.');
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
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
          <p className="font-medium text-slate-900 dark:text-white">{row.items_count ?? 0}</p>
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
          <Button
            size="sm"
            variant="ghost"
            aria-label="Télécharger l’ordonnance"
            onClick={() => void downloadPdf(`/pdf/prescription/${row.id}`)}
          >
            <Download className="h-4 w-4" />
          </Button>
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
    </div>
  );
}

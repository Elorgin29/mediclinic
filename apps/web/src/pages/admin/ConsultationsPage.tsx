/**
 * Consultations (back-office).
 *
 * Liste des comptes-rendus avec accès au détail, impression PDF et création
 * d'une consultation depuis un rendez-vous terminé.
 */

import {
  formatDateTime,
  type Consultation,
  type Paginated,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Download, Plus, Search } from 'lucide-react';

import {
  Button,
  Card,
  DataTable,
  Input,
  Pagination,
  StatCard,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
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
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    from: '',
    to: '',
  });

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
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Download className="h-3.5 w-3.5" />}
          onClick={() => void downloadPdf(`/pdf/consultation/${row.id}`)}
        >
          PDF
        </Button>
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
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} disabled>
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
    </div>
  );
}

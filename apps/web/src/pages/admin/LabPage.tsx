/**
 * Laboratoire (back-office).
 *
 * Demandes d'analyses prescrites par les médecins, saisie des résultats et
 * catalogue des examens disponibles.
 */

import {
  LAB_REQUEST_STATUS_LABELS_FR,
  LAB_REQUEST_STATUSES,
  formatDateTime,
  type LabRequest,
  type LabTest,
  type Paginated,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

export default function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    status: '',
  });

  const [resultTarget, setResultTarget] = useState<LabRequest | null>(null);
  const [resultText, setResultText] = useState('');

  const requestsQuery = useQuery({
    queryKey: queryKeys.lab.requests(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<LabRequest>>(`/lab/requests?${params.toString()}`);
    },
  });

  const testsQuery = useQuery({
    queryKey: queryKeys.lab.tests,
    queryFn: () => apiGet<LabTest[]>('/lab/tests'),
  });

  const resultMutation = useMutation({
    mutationFn: () =>
      apiPatch<LabRequest>(`/lab/requests/${resultTarget?.id}`, {
        status: 'COMPLETED',
        resultText: resultText.trim(),
      }),
    onSuccess: () => {
      toast.success('Résultat enregistré.');
      setResultTarget(null);
      setResultText('');
      void queryClient.invalidateQueries({ queryKey: ['lab'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<LabRequest>[] = [
    {
      key: 'requested_at',
      header: 'Demandé le',
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
          {formatDateTime(row.requested_at)}
        </span>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{row.patient_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.doctor_name ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'lab_test_name',
      header: 'Analyse',
      render: (row) => (
        <span className="text-sm text-slate-700 dark:text-slate-200">{row.lab_test_name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge
          kind="generic"
          status={row.status}
          label={LAB_REQUEST_STATUS_LABELS_FR[row.status as keyof typeof LAB_REQUEST_STATUS_LABELS_FR] ?? row.status}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Can permission="lab:update">
          <Button
            size="sm"
            variant="secondary"
            disabled={row.status === 'CANCELLED'}
            onClick={() => {
              setResultTarget(row);
              setResultText(row.result_text ?? '');
            }}
          >
            {row.result_text ? 'Modifier' : 'Saisir le résultat'}
          </Button>
        </Can>
      ),
    },
  ];

  const meta = requestsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Laboratoire"
        subtitle="Demandes d’analyses et saisie des résultats."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Demandes en attente"
          value={(requestsQuery.data?.data ?? []).filter((item) => item.status === 'PENDING').length}
          icon={FlaskConical}
          tone="warning"
        />
        <StatCard
          label="Résultats disponibles"
          value={(requestsQuery.data?.data ?? []).filter((item) => item.status === 'COMPLETED').length}
          icon={FlaskConical}
          tone="success"
        />
        <StatCard label="Catalogue" value={testsQuery.data?.length ?? 0} icon={FlaskConical} tone="info" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <Input
            placeholder="Patient ou analyse…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher une demande"
          />
          <Select
            options={LAB_REQUEST_STATUSES.map((status) => ({
              value: status,
              label: LAB_REQUEST_STATUS_LABELS_FR[status],
            }))}
            placeholder="Tous les statuts"
            value={String(filters.status ?? '')}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Filtrer par statut"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={requestsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={requestsQuery.isLoading}
          isError={requestsQuery.isError}
          errorMessage={getApiErrorMessage(requestsQuery.error)}
          onRetry={() => void requestsQuery.refetch()}
          emptyTitle="Aucune demande d’analyse"
          emptyDescription="Aucune demande ne correspond aux filtres sélectionnés."
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

      {/* Catalogue */}
      <Card>
        <CardHeader
          title="Catalogue des analyses"
          description={`${testsQuery.data?.length ?? 0} examen(s) disponible(s)`}
        />
        <CardBody className="p-0">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Analyse</th>
                  <th>Catégorie</th>
                  <th className="text-right">Délai</th>
                </tr>
              </thead>
              <tbody>
                {(testsQuery.data ?? []).map((test) => (
                  <tr key={test.id}>
                    <td className="font-medium text-slate-900 dark:text-white">{test.name}</td>
                    <td className="text-slate-600 dark:text-slate-300">{test.category}</td>
                    <td className="text-right text-slate-600 dark:text-slate-300">
                      {test.turnaround_hours} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Saisie du résultat */}
      <Modal
        isOpen={resultTarget !== null}
        onClose={() => setResultTarget(null)}
        title="Saisir le résultat d’analyse"
        description={resultTarget ? `${resultTarget.lab_test_name} — ${resultTarget.patient_name ?? ''}` : undefined}
        isBusy={resultMutation.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResultTarget(null)}>
              Annuler
            </Button>
            <Button onClick={() => resultMutation.mutate()} isLoading={resultMutation.isPending}>
              Enregistrer le résultat
            </Button>
          </>
        }
      >
        <Textarea
          label="Résultat"
          rows={6}
          value={resultText}
          onChange={(event) => setResultText(event.target.value)}
          hint="Le statut passera automatiquement à « Résultat disponible »."
          placeholder="Valeurs mesurées, interprétation, valeurs de référence…"
        />
      </Modal>
    </div>
  );
}

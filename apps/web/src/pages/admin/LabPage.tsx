/**
 * Laboratoire (back-office).
 *
 * Demandes d'analyses prescrites par les médecins, saisie des résultats,
 * suppression et catalogue des examens disponibles (création / modification).
 */

import {
  LAB_REQUEST_STATUS_LABELS_FR,
  LAB_REQUEST_STATUSES,
  formatDateTime,
  formatMoney,
  type Doctor,
  type LabRequest,
  type LabTest,
  type Paginated,
  type Patient,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
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
import { PatientPicker } from '@/components/admin/PatientPicker';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

type LabRequestStatus = (typeof LAB_REQUEST_STATUSES)[number];

export default function LabPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    status: '',
  });

  const [requestOpen, setRequestOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LabRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabRequest | null>(null);
  const [testTarget, setTestTarget] = useState<LabTest | 'new' | null>(null);

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

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Doctor>>('/doctors?limit=100'),
    enabled: requestOpen,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['lab'] });
  };

  const createRequestMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<LabRequest>('/lab/requests', payload),
    onSuccess: () => {
      toast.success('Demande d’analyse créée.');
      setRequestOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<LabRequest>(`/lab/requests/${id}`, payload),
    onSuccess: () => {
      toast.success('Demande mise à jour.');
      setEditTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/lab/requests/${id}`),
    onSuccess: () => {
      toast.success('Demande supprimée.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const createTestMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<LabTest>('/lab/tests', payload),
    onSuccess: () => {
      toast.success('Analyse ajoutée au catalogue.');
      setTestTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateTestMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<LabTest>(`/lab/tests/${id}`, payload),
    onSuccess: () => {
      toast.success('Analyse mise à jour.');
      setTestTarget(null);
      invalidate();
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
        <div>
          <p className="text-sm text-slate-700 dark:text-slate-200">{row.lab_test_name ?? '—'}</p>
          {row.result_text && (
            <p className="max-w-xs truncate text-xs text-slate-500 dark:text-slate-400" title={row.result_text}>
              {row.result_text}
            </p>
          )}
        </div>
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
        <div className="flex justify-end gap-1">
          <Can permission="lab:update">
            <Button
              size="sm"
              variant="secondary"
              disabled={row.status === 'CANCELLED'}
              onClick={() => setEditTarget(row)}
            >
              {row.result_text ? 'Modifier' : 'Résultat'}
            </Button>
          </Can>
          <Can permission="lab:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer la demande"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = requestsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Laboratoire"
        subtitle="Demandes d’analyses, saisie des résultats et catalogue des examens."
        actions={
          <Can permission="lab:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>
              Nouvelle demande
            </Button>
          </Can>
        }
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
          emptyAction={
            <Can permission="lab:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setRequestOpen(true)}>
                Créer une demande
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

      {/* Catalogue */}
      <Card>
        <CardHeader
          title="Catalogue des analyses"
          description={`${testsQuery.data?.length ?? 0} examen(s) disponible(s)`}
          actions={
            <Can permission="lab:create">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setTestTarget('new')}
              >
                Ajouter une analyse
              </Button>
            </Can>
          }
        />
        <CardBody className="p-0">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Analyse</th>
                  <th>Catégorie</th>
                  <th className="text-right">Prix</th>
                  <th className="text-right">Délai</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(testsQuery.data ?? []).map((test) => (
                  <tr key={test.id}>
                    <td className="font-medium text-slate-900 dark:text-white">{test.name}</td>
                    <td className="text-slate-600 dark:text-slate-300">{test.category}</td>
                    <td className="text-right text-slate-600 dark:text-slate-300">{formatMoney(test.price)}</td>
                    <td className="text-right text-slate-600 dark:text-slate-300">{test.turnaround_hours} h</td>
                    <td className="text-right">
                      <Can permission="lab:update">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Modifier l’analyse"
                          onClick={() => setTestTarget(test)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <LabRequestFormModal
        isOpen={requestOpen}
        doctors={doctorsQuery.data?.data ?? []}
        tests={testsQuery.data ?? []}
        isPending={createRequestMutation.isPending}
        onClose={() => setRequestOpen(false)}
        onSubmit={(payload) => createRequestMutation.mutate(payload)}
      />

      <LabResultModal
        request={editTarget}
        isPending={updateRequestMutation.isPending}
        onClose={() => setEditTarget(null)}
        onSubmit={(payload) => editTarget && updateRequestMutation.mutate({ id: editTarget.id, payload })}
      />

      <LabTestFormModal
        isOpen={testTarget !== null}
        test={testTarget !== null && testTarget !== 'new' ? testTarget : undefined}
        isPending={createTestMutation.isPending || updateTestMutation.isPending}
        onClose={() => setTestTarget(null)}
        onSubmit={(payload) => {
          if (testTarget !== null && testTarget !== 'new') {
            updateTestMutation.mutate({ id: testTarget.id, payload });
          } else {
            createTestMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer cette demande ?"
        message={
          <>
            La demande de <span className="font-semibold">{deleteTarget?.lab_test_name ?? 'cette analyse'}</span>{' '}
            pour <span className="font-semibold">{deleteTarget?.patient_name ?? 'ce patient'}</span> sera
            définitivement supprimée.
          </>
        }
        confirmLabel="Supprimer"
        isLoading={deleteRequestMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteRequestMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Nouvelle demande d'analyse                                                  */
/* -------------------------------------------------------------------------- */

function LabRequestFormModal({
  isOpen,
  doctors,
  tests,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  doctors: Doctor[];
  tests: LabTest[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState('');
  const [labTestId, setLabTestId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPatient(null);
    setDoctorId('');
    setLabTestId('');
    setNotes('');
  }, [isOpen]);

  const handleSubmit = (): void => {
    if (!patient) {
      toast.error('Sélectionnez un patient.');
      return;
    }
    if (!doctorId || !labTestId) {
      toast.error('Médecin et analyse sont obligatoires.');
      return;
    }
    onSubmit({
      patientId: patient.id,
      doctorId: Number(doctorId),
      labTestId: Number(labTestId),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouvelle demande d’analyse"
      description="La demande est transmise au laboratoire avec le statut « en attente »."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            Créer la demande
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PatientPicker
          value={patient}
          onChange={setPatient}
          required
          hint="Recherchez un patient existant par nom, email ou téléphone."
        />

        <Select
          label="Médecin prescripteur"
          required
          placeholder="Choisir un praticien"
          options={doctors.map((doctor) => ({
            value: doctor.id,
            label: `Dr ${doctor.first_name} ${doctor.last_name} — ${doctor.specialty_name ?? ''}`,
          }))}
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
        />

        <Select
          label="Analyse"
          required
          placeholder="Choisir une analyse"
          options={tests.map((test) => ({
            value: test.id,
            label: `${test.name} — ${test.category} (${formatMoney(test.price)})`,
          }))}
          value={labTestId}
          onChange={(event) => setLabTestId(event.target.value)}
        />

        <Textarea
          label="Notes pour le laboratoire"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Résultat / statut d'une demande                                             */
/* -------------------------------------------------------------------------- */

function LabResultModal({
  request,
  isPending,
  onClose,
  onSubmit,
}: {
  request: LabRequest | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [status, setStatus] = useState<LabRequestStatus>('PENDING');
  const [resultText, setResultText] = useState('');

  useEffect(() => {
    if (!request) return;
    setStatus((request.status as LabRequestStatus) ?? 'PENDING');
    setResultText(request.result_text ?? '');
  }, [request]);

  const handleSubmit = (): void => {
    if (status === 'COMPLETED' && resultText.trim().length === 0) {
      toast.error('Saisissez le résultat avant de marquer la demande comme terminée.');
      return;
    }
    onSubmit({
      status,
      ...(resultText.trim() ? { resultText: resultText.trim() } : {}),
    });
  };

  return (
    <Modal
      isOpen={request !== null}
      onClose={onClose}
      title="Résultat d’analyse"
      description={request ? `${request.lab_test_name} — ${request.patient_name ?? ''}` : undefined}
      isBusy={isPending}
      footer={
        <>
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
          label="Statut"
          options={LAB_REQUEST_STATUSES.map((value) => ({
            value,
            label: LAB_REQUEST_STATUS_LABELS_FR[value],
          }))}
          value={status}
          onChange={(event) => setStatus(event.target.value as LabRequestStatus)}
        />

        <Textarea
          label="Résultat"
          rows={6}
          value={resultText}
          onChange={(event) => setResultText(event.target.value)}
          hint="Requis lorsque le statut est « Résultat disponible »."
          placeholder="Valeurs mesurées, interprétation, valeurs de référence…"
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Catalogue : création / modification                                         */
/* -------------------------------------------------------------------------- */

function LabTestFormModal({
  isOpen,
  test,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  test?: LabTest;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({
    name: '',
    category: '',
    price: '',
    turnaroundHours: '24',
  });

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      name: test?.name ?? '',
      category: test?.category ?? '',
      price: test ? String(Number(test.price)) : '',
      turnaroundHours: test ? String(test.turnaround_hours) : '24',
    });
  }, [isOpen, test]);

  const handleSubmit = (): void => {
    if (values.name.trim().length < 2 || values.category.trim().length < 2) {
      toast.error('Nom et catégorie sont obligatoires.');
      return;
    }
    const price = Number(values.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Indiquez un prix valide.');
      return;
    }
    const turnaroundHours = Number(values.turnaroundHours);
    if (!Number.isInteger(turnaroundHours) || turnaroundHours < 1 || turnaroundHours > 720) {
      toast.error('Le délai doit être compris entre 1 et 720 heures.');
      return;
    }

    onSubmit({
      name: values.name.trim(),
      category: values.category.trim(),
      price,
      turnaroundHours,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={test ? 'Modifier l’analyse' : 'Nouvelle analyse'}
      description="Les analyses du catalogue sont proposées lors de la prescription."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {test ? 'Enregistrer' : 'Ajouter au catalogue'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nom de l’analyse"
          required
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
        <Input
          label="Catégorie"
          required
          placeholder="ex. Hématologie"
          value={values.category}
          onChange={(event) => setValues({ ...values, category: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prix (€)"
            type="number"
            min={0}
            step="0.01"
            required
            value={values.price}
            onChange={(event) => setValues({ ...values, price: event.target.value })}
          />
          <Input
            label="Délai (heures)"
            type="number"
            min={1}
            max={720}
            step={1}
            value={values.turnaroundHours}
            onChange={(event) => setValues({ ...values, turnaroundHours: event.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

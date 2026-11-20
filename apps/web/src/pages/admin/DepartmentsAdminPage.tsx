/**
 * Départements — écran d'administration dédié.
 *
 * Référentiel des départements de la clinique, avec médecin chef, description
 * et nombre de praticiens rattachés. Création, modification et suppression sont
 * disponibles selon les permissions.
 */

import { type Department, type Doctor, type Paginated } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  StatCard,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

/** Département enrichi par l'API. */
interface DepartmentRow extends Department {
  doctors_count?: number;
}

export default function DepartmentsAdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formTarget, setFormTarget] = useState<DepartmentRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null);

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.all,
    queryFn: () => apiGet<DepartmentRow[]>('/departments'),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Doctor>>('/doctors?limit=100'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Department>('/departments', payload),
    onSuccess: () => {
      toast.success('Département créé.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Department>(`/departments/${id}`, payload),
    onSuccess: () => {
      toast.success('Département mis à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/departments/${id}`),
    onSuccess: () => {
      toast.success('Département supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const data = departmentsQuery.data ?? [];
    if (!term) return data;
    return data.filter(
      (department) =>
        department.name.toLowerCase().includes(term) ||
        (department.description ?? '').toLowerCase().includes(term) ||
        (department.head_doctor_name ?? '').toLowerCase().includes(term),
    );
  }, [departmentsQuery.data, search]);

  const totalDoctors = (departmentsQuery.data ?? []).reduce(
    (sum, department) => sum + (department.doctors_count ?? 0),
    0,
  );
  const withoutHead = (departmentsQuery.data ?? []).filter((department) => !department.head_doctor_id).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Départements"
        subtitle="Organisation médicale : regroupement des spécialités et désignation des chefs de département."
        actions={
          <Can permission="department:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouveau département
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Départements"
          value={departmentsQuery.data?.length ?? 0}
          icon={Building2}
          tone="info"
        />
        <StatCard label="Médecins rattachés" value={totalDoctors} icon={UserRound} tone="success" />
        <StatCard
          label="Sans chef désigné"
          value={withoutHead}
          icon={UserRound}
          tone={withoutHead > 0 ? 'warning' : 'brand'}
        />
      </div>

      <Card className="p-4">
        <Input
          placeholder="Rechercher un département, un chef…"
          leftIcon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Rechercher un département"
        />
      </Card>

      {departmentsQuery.isLoading ? (
        <Card className="py-12 text-center text-sm text-slate-500">Chargement…</Card>
      ) : departmentsQuery.isError ? (
        <Card className="py-12 text-center text-sm text-rose-600">
          {getApiErrorMessage(departmentsQuery.error)}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="h-8 w-8 text-slate-300" aria-hidden />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {search ? 'Aucun département ne correspond à la recherche.' : 'Aucun département enregistré.'}
          </p>
          <Can permission="department:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Créer un département
            </Button>
          </Can>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((department) => (
            <Card key={department.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    <Building2 className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{department.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {department.doctors_count ?? 0} médecin(s)
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Can permission="department:update">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Modifier le département"
                      onClick={() => setFormTarget(department)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Can>
                  <Can permission="department:delete">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                      aria-label="Supprimer le département"
                      onClick={() => setDeleteTarget(department)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Can>
                </div>
              </div>

              <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600 dark:text-slate-300">
                {department.description || 'Aucune description.'}
              </p>

              <div className="mt-3 flex flex-wrap gap-1">
                {department.head_doctor_name ? (
                  <Badge tone="brand">Chef : {department.head_doctor_name}</Badge>
                ) : (
                  <Badge tone="warning">Chef non désigné</Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <DepartmentFormModal
        isOpen={formTarget !== null}
        department={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        doctors={doctorsQuery.data?.data ?? []}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => setFormTarget(null)}
        onSubmit={(payload) => {
          if (formTarget !== null && formTarget !== 'new') {
            updateMutation.mutate({ id: formTarget.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer ce département ?"
        message={
          <>
            Le département <span className="font-semibold">{deleteTarget?.name}</span> sera définitivement
            supprimé. Les médecins rattachés devront être réaffectés.
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
/* Formulaire                                                                  */
/* -------------------------------------------------------------------------- */

function DepartmentFormModal({
  isOpen,
  department,
  doctors,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  department?: DepartmentRow;
  doctors: Doctor[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [headDoctorId, setHeadDoctorId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(department?.name ?? '');
    setDescription(department?.description ?? '');
    setHeadDoctorId(department?.head_doctor_id ? String(department.head_doctor_id) : '');
  }, [isOpen, department]);

  const handleSubmit = (): void => {
    if (name.trim().length < 2) {
      toast.error('Le nom doit contenir au moins 2 caractères.');
      return;
    }
    onSubmit({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      headDoctorId: headDoctorId ? Number(headDoctorId) : null,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={department ? 'Modifier le département' : 'Nouveau département'}
      description="Le chef de département est le médecin référent pour les validations cliniques."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {department ? 'Enregistrer' : 'Créer le département'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nom du département"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Select
          label="Chef de département"
          placeholder="Non désigné"
          options={doctors.map((doctor) => ({
            value: doctor.id,
            label: `Dr ${doctor.first_name} ${doctor.last_name}${doctor.specialty_name ? ` — ${doctor.specialty_name}` : ''}`,
          }))}
          value={headDoctorId}
          onChange={(event) => setHeadDoctorId(event.target.value)}
        />
      </div>
    </Modal>
  );
}

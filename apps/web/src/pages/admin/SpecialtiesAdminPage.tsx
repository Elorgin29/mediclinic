/**
 * Spécialités et départements — écrans d'administration.
 *
 * Deux référentiels simples, présentés sur la même page à onglets : ils sont
 * étroitement liés (un département regroupe des spécialités et un médecin
 * référent).
 */

import {
  formatMoney,
  type Department,
  type Doctor,
  type Paginated,
  type Specialty,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Card, CardBody, CardHeader, Input, Modal, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

/** Spécialité enrichie du nombre de médecins (renvoyé par l'API). */
interface SpecialtyWithCount extends Specialty {
  doctors_count?: number;
}

/** Département enrichi. */
interface DepartmentWithHead extends Department {
  doctors_count?: number;
}

export default function SpecialtiesAdminPage(): JSX.Element {
  const queryClient = useQueryClient();

  const [specialtyModal, setSpecialtyModal] = useState<{ open: boolean; target: SpecialtyWithCount | null }>({
    open: false,
    target: null,
  });
  const [departmentModal, setDepartmentModal] = useState<{ open: boolean; target: DepartmentWithHead | null }>({
    open: false,
    target: null,
  });

  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<SpecialtyWithCount[]>('/specialties'),
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.all,
    queryFn: () => apiGet<DepartmentWithHead[]>('/departments'),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all({ limit: 100 }),
    queryFn: () => apiGetRaw<Paginated<Doctor>>('/doctors?limit=100'),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['specialties'] });
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const saveSpecialty = useMutation({
    mutationFn: (payload: { id?: number; values: Record<string, unknown> }) =>
      payload.id
        ? apiPatch<Specialty>(`/specialties/${payload.id}`, payload.values)
        : apiPost<Specialty>('/specialties', payload.values),
    onSuccess: () => {
      toast.success('Spécialité enregistrée.');
      setSpecialtyModal({ open: false, target: null });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteSpecialty = useMutation({
    mutationFn: (id: number) => apiDelete(`/specialties/${id}`),
    onSuccess: () => {
      toast.success('Spécialité supprimée.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const saveDepartment = useMutation({
    mutationFn: (payload: { id?: number; values: Record<string, unknown> }) =>
      payload.id
        ? apiPatch<Department>(`/departments/${payload.id}`, payload.values)
        : apiPost<Department>('/departments', payload.values),
    onSuccess: () => {
      toast.success('Département enregistré.');
      setDepartmentModal({ open: false, target: null });
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteDepartment = useMutation({
    mutationFn: (id: number) => apiDelete(`/departments/${id}`),
    onSuccess: () => {
      toast.success('Département supprimé.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Spécialités & départements"
        subtitle="Référentiels structurant l’offre de soins et l’affectation des médecins."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------------------ */}
        {/* Spécialités                                                   */}
        {/* ------------------------------------------------------------ */}
        <Card>
          <CardHeader
            title="Spécialités"
            description={`${specialtiesQuery.data?.length ?? 0} spécialité(s)`}
            actions={
              <Can permission="specialty:create">
                <Button
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setSpecialtyModal({ open: true, target: null })}
                >
                  Ajouter
                </Button>
              </Can>
            }
          />
          <CardBody className="p-0">
            {specialtiesQuery.isLoading ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(specialtiesQuery.data ?? []).map((specialty) => (
                  <li key={specialty.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Tags className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{specialty.name}</p>
                        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {specialty.description ?? '—'}
                        </p>
                        {specialty.doctors_count !== undefined && (
                          <Badge tone="neutral" className="mt-1">
                            {specialty.doctors_count} médecin(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Can permission="specialty:update">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSpecialtyModal({ open: true, target: specialty })}
                        >
                          Modifier
                        </Button>
                      </Can>
                      <Can permission="specialty:delete">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600"
                          onClick={() => deleteSpecialty.mutate(specialty.id)}
                        >
                          Supprimer
                        </Button>
                      </Can>
                    </div>
                  </li>
                ))}
                {(specialtiesQuery.data ?? []).length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-slate-500">Aucune spécialité.</li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* ------------------------------------------------------------ */}
        {/* Départements                                                  */}
        {/* ------------------------------------------------------------ */}
        <Card>
          <CardHeader
            title="Départements"
            description={`${departmentsQuery.data?.length ?? 0} département(s)`}
            actions={
              <Can permission="department:create">
                <Button
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => setDepartmentModal({ open: true, target: null })}
                >
                  Ajouter
                </Button>
              </Can>
            }
          />
          <CardBody className="p-0">
            {departmentsQuery.isLoading ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {(departmentsQuery.data ?? []).map((department) => (
                  <li key={department.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{department.name}</p>
                        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {department.description ?? '—'}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {department.head_doctor_name && (
                            <Badge tone="brand">Chef : {department.head_doctor_name}</Badge>
                          )}
                          {department.doctors_count !== undefined && (
                            <Badge tone="neutral">{department.doctors_count} médecin(s)</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Can permission="department:update">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDepartmentModal({ open: true, target: department })}
                        >
                          Modifier
                        </Button>
                      </Can>
                      <Can permission="department:delete">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600"
                          onClick={() => deleteDepartment.mutate(department.id)}
                        >
                          Supprimer
                        </Button>
                      </Can>
                    </div>
                  </li>
                ))}
                {(departmentsQuery.data ?? []).length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-slate-500">Aucun département.</li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Modales */}
      <SimpleNameModal
        isOpen={specialtyModal.open}
        title={specialtyModal.target ? 'Modifier la spécialité' : 'Nouvelle spécialité'}
        nameLabel="Nom de la spécialité"
        initial={specialtyModal.target}
        isPending={saveSpecialty.isPending}
        onClose={() => setSpecialtyModal({ open: false, target: null })}
        onSubmit={(values) =>
          saveSpecialty.mutate({ id: specialtyModal.target?.id, values })
        }
      />

      <DepartmentModal
        isOpen={departmentModal.open}
        target={departmentModal.target}
        doctors={doctorsQuery.data?.data ?? []}
        isPending={saveDepartment.isPending}
        onClose={() => setDepartmentModal({ open: false, target: null })}
        onSubmit={(values) => saveDepartment.mutate({ id: departmentModal.target?.id, values })}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modale nom + description                                                    */
/* -------------------------------------------------------------------------- */

function SimpleNameModal({
  isOpen,
  title,
  nameLabel,
  initial,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  title: string;
  nameLabel: string;
  initial: { name: string; description: string | null } | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lastKey, setLastKey] = useState('init');
  const formKey = initial?.name ?? 'new';

  if (isOpen && lastKey !== formKey) {
    setLastKey(formKey);
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      isBusy={isPending}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            isLoading={isPending}
            onClick={() => {
              if (name.trim().length < 2) {
                toast.error('Le nom doit contenir au moins 2 caractères.');
                return;
              }
              onSubmit({ name: name.trim(), description: description.trim() || undefined });
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={nameLabel} required value={name} onChange={(event) => setName(event.target.value)} />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Modale département                                                          */
/* -------------------------------------------------------------------------- */

function DepartmentModal({
  isOpen,
  target,
  doctors,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  target: DepartmentWithHead | null;
  doctors: Doctor[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [headDoctorId, setHeadDoctorId] = useState('');
  const [lastKey, setLastKey] = useState('init');
  const formKey = target?.id ?? 'new';

  if (isOpen && lastKey !== formKey) {
    setLastKey(String(formKey));
    setName(target?.name ?? '');
    setDescription(target?.description ?? '');
    setHeadDoctorId(target?.head_doctor_id ? String(target.head_doctor_id) : '');
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={target ? 'Modifier le département' : 'Nouveau département'}
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            isLoading={isPending}
            onClick={() => {
              if (name.trim().length < 2) {
                toast.error('Le nom doit contenir au moins 2 caractères.');
                return;
              }
              onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                headDoctorId: headDoctorId ? Number(headDoctorId) : null,
              });
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Nom du département" required value={name} onChange={(event) => setName(event.target.value)} />
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
            label: `Dr ${doctor.first_name} ${doctor.last_name} — ${formatMoney(doctor.consultation_fee)}`,
          }))}
          value={headDoctorId}
          onChange={(event) => setHeadDoctorId(event.target.value)}
        />
      </div>
    </Modal>
  );
}

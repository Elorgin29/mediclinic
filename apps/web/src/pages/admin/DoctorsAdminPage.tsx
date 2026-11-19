/**
 * Gestion des médecins (back-office).
 *
 * Liste des praticiens avec leur spécialité, département, tarif et statut
 * d'accueil de nouveaux patients. La création ouvre un formulaire complet.
 */

import {
  formatMoney,
  type Department,
  type Doctor,
  type Paginated,
  type Specialty,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Stethoscope, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

export default function DoctorsAdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    specialtyId: '',
    accepting: '',
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Doctor | null>(null);

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Doctor>>(`/doctors?${params.toString()}`);
    },
  });

  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties'),
  });

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments.all,
    queryFn: () => apiGet<Department[]>('/departments'),
  });

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['doctors'] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Doctor>('/doctors', payload),
    onSuccess: () => {
      toast.success('Médecin ajouté.');
      setIsCreateOpen(false);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<Doctor>(`/doctors/${editTarget?.id}`, payload),
    onSuccess: () => {
      toast.success('Profil médecin mis à jour.');
      setEditTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<Doctor>[] = [
    {
      key: 'last_name',
      header: 'Médecin',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            {row.first_name.charAt(0)}
            {row.last_name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">
              Dr {row.first_name} {row.last_name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'specialty_name',
      header: 'Spécialité',
      render: (row) => (
        <div>
          <p className="text-slate-700 dark:text-slate-200">{row.specialty_name ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.department_name ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'license_number',
      header: 'N° d’ordre',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{row.license_number}</span>
      ),
    },
    {
      key: 'consultation_fee',
      header: 'Tarif',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-slate-900 dark:text-white">
          {formatMoney(row.consultation_fee)}
        </span>
      ),
    },
    {
      key: 'is_accepting_patients',
      header: 'Accueil',
      render: (row) => (
        <Badge tone={row.is_accepting_patients ? 'success' : 'neutral'} dot>
          {row.is_accepting_patients ? 'Ouvert' : 'Complet'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Can permission="doctor:update">
          <Button size="sm" variant="secondary" onClick={() => setEditTarget(row)}>
            Modifier
          </Button>
        </Can>
      ),
    },
  ];

  const meta = doctorsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Médecins"
        subtitle="Praticiens de la clinique, spécialités et conditions d’exercice."
        actions={
          <Can permission="doctor:create">
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
              Ajouter un médecin
            </Button>
          </Can>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_200px_auto]">
          <Input
            placeholder="Nom, email ou n° d’ordre…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un médecin"
          />
          <Select
            options={(specialtiesQuery.data ?? []).map((specialty) => ({
              value: specialty.id,
              label: specialty.name,
            }))}
            placeholder="Toutes les spécialités"
            value={String(filters.specialtyId ?? '')}
            onChange={(event) => update({ specialtyId: event.target.value })}
            aria-label="Filtrer par spécialité"
          />
          <Select
            options={[{ value: 'true', label: 'Accueille des patients' }]}
            placeholder="Tous les statuts"
            value={String(filters.accepting ?? '')}
            onChange={(event) => update({ accepting: event.target.value })}
            aria-label="Filtrer par disponibilité"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={doctorsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={doctorsQuery.isLoading}
          isError={doctorsQuery.isError}
          errorMessage={getApiErrorMessage(doctorsQuery.error)}
          onRetry={() => void doctorsQuery.refetch()}
          emptyTitle="Aucun médecin"
          emptyDescription="Aucun praticien ne correspond aux filtres sélectionnés."
          emptyAction={
            <Can permission="doctor:create">
              <Button size="sm" leftIcon={<Stethoscope className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
                Ajouter un praticien
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

      <DoctorFormModal
        isOpen={isCreateOpen || editTarget !== null}
        doctor={editTarget}
        specialties={specialtiesQuery.data ?? []}
        departments={departmentsQuery.data ?? []}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsCreateOpen(false);
          setEditTarget(null);
        }}
        onSubmit={(payload) => {
          if (editTarget) updateMutation.mutate(payload);
          else createMutation.mutate(payload);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaire                                                                  */
/* -------------------------------------------------------------------------- */

function DoctorFormModal({
  isOpen,
  doctor,
  specialties,
  departments,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  doctor: Doctor | null;
  specialties: Specialty[];
  departments: Department[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const formKey = doctor?.id ?? 'new';
  const [lastKey, setLastKey] = useState<string>('init');
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    specialtyId: '',
    departmentId: '',
    licenseNumber: '',
    consultationFee: '50',
    bio: '',
    isAcceptingPatients: true,
  });

  if (isOpen && lastKey !== formKey) {
    setLastKey(String(formKey));
    setValues({
      firstName: doctor?.first_name ?? '',
      lastName: doctor?.last_name ?? '',
      email: doctor?.email ?? '',
      phone: '',
      password: '',
      specialtyId: doctor ? String(doctor.specialty_id) : '',
      departmentId: doctor?.department_id ? String(doctor.department_id) : '',
      licenseNumber: doctor?.license_number ?? '',
      consultationFee: doctor?.consultation_fee ?? '50',
      bio: doctor?.bio ?? '',
      isAcceptingPatients: doctor?.is_accepting_patients ?? true,
    });
  }

  const handleSubmit = (): void => {
    if (!values.specialtyId || !values.licenseNumber.trim()) {
      toast.error('Spécialité et numéro d’ordre sont obligatoires.');
      return;
    }

    const payload: Record<string, unknown> = {
      specialtyId: Number(values.specialtyId),
      departmentId: values.departmentId ? Number(values.departmentId) : null,
      licenseNumber: values.licenseNumber.trim(),
      consultationFee: Number(values.consultationFee),
      bio: values.bio.trim() || null,
      isAcceptingPatients: values.isAcceptingPatients,
    };

    if (!doctor) {
      if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
        toast.error('Prénom, nom et email sont obligatoires pour créer le compte.');
        return;
      }
      if (values.password.length < 8) {
        toast.error('Le mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      payload.firstName = values.firstName.trim();
      payload.lastName = values.lastName.trim();
      payload.email = values.email.trim();
      payload.phone = values.phone.trim() || undefined;
      payload.password = values.password;
    }

    onSubmit(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={doctor ? 'Modifier le profil médecin' : 'Ajouter un médecin'}
      description={
        doctor
          ? `Dr ${doctor.first_name} ${doctor.last_name}`
          : 'Le compte utilisateur et le rôle DOCTOR sont créés automatiquement.'
      }
      size="lg"
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {doctor ? 'Enregistrer' : 'Créer le médecin'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!doctor && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Prénom"
                required
                value={values.firstName}
                onChange={(event) => setValues({ ...values, firstName: event.target.value })}
              />
              <Input
                label="Nom"
                required
                value={values.lastName}
                onChange={(event) => setValues({ ...values, lastName: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email professionnel"
                type="email"
                required
                value={values.email}
                onChange={(event) => setValues({ ...values, email: event.target.value })}
              />
              <Input
                label="Téléphone"
                type="tel"
                value={values.phone}
                onChange={(event) => setValues({ ...values, phone: event.target.value })}
              />
            </div>
            <Input
              label="Mot de passe initial"
              type="password"
              required
              hint="8 caractères minimum."
              value={values.password}
              onChange={(event) => setValues({ ...values, password: event.target.value })}
            />
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Spécialité"
            required
            placeholder="Choisir une spécialité"
            options={specialties.map((specialty) => ({ value: specialty.id, label: specialty.name }))}
            value={values.specialtyId}
            onChange={(event) => setValues({ ...values, specialtyId: event.target.value })}
          />
          <Select
            label="Département"
            placeholder="Non affecté"
            options={departments.map((department) => ({ value: department.id, label: department.name }))}
            value={values.departmentId}
            onChange={(event) => setValues({ ...values, departmentId: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Numéro d’ordre"
            required
            placeholder="MED-CARD-0001"
            value={values.licenseNumber}
            onChange={(event) => setValues({ ...values, licenseNumber: event.target.value })}
          />
          <Input
            label="Tarif de consultation (€)"
            type="number"
            min="0"
            step="5"
            value={values.consultationFee}
            onChange={(event) => setValues({ ...values, consultationFee: event.target.value })}
          />
        </div>

        <div>
          <label htmlFor="doctor-bio" className="label">
            Présentation
          </label>
          <textarea
            id="doctor-bio"
            rows={3}
            value={values.bio}
            onChange={(event) => setValues({ ...values, bio: event.target.value })}
            className="input resize-y"
            placeholder="Parcours, domaines d’expertise…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={values.isAcceptingPatients}
            onChange={(event) => setValues({ ...values, isAcceptingPatients: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
          />
          Accueille de nouveaux patients (visible dans l’annuaire public)
        </label>
      </div>
    </Modal>
  );
}

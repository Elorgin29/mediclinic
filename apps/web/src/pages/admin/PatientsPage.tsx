/**
 * Liste des patients (back-office).
 *
 * Recherche multicritère, pagination, création, modification et suppression
 * d'un dossier, et accès au dossier complet. La recherche interroge le nom, le
 * prénom, l'email, le téléphone et le numéro d'assurance.
 */

import { formatAge, formatDate, type Paginated, type Patient } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

export default function PatientsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    gender: '',
  });

  const [formTarget, setFormTarget] = useState<Patient | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

  const patientsQuery = useQuery({
    queryKey: queryKeys.patients.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Patient>>(`/patients?${params.toString()}`);
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Patient>('/patients', payload),
    onSuccess: () => {
      toast.success('Dossier patient créé.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Patient>(`/patients/${id}`, payload),
    onSuccess: () => {
      toast.success('Dossier patient mis à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/patients/${id}`),
    onSuccess: () => {
      toast.success('Dossier patient supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<Patient>[] = [
    {
      key: 'last_name',
      header: 'Patient',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            {row.first_name.charAt(0)}
            {row.last_name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">
              {row.last_name.toUpperCase()} {row.first_name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Dossier #{row.id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'birth_date',
      header: 'Âge',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{formatAge(row.birth_date)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(row.birth_date)}</p>
        </div>
      ),
    },
    {
      key: 'blood_group',
      header: 'Groupe',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {row.blood_group ?? '—'}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Contact',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-xs">
          <p className="text-slate-700 dark:text-slate-200">{row.phone ?? '—'}</p>
          <p className="text-slate-500 dark:text-slate-400">{row.email ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'allergies',
      header: 'Allergies',
      hideOnMobile: true,
      render: (row) =>
        row.allergies ? (
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {row.allergies}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Aucune connue</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/patients/${row.id}`)}>
            Dossier
          </Button>
          <Can permission="patient:update">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Modifier le dossier"
              onClick={() => setFormTarget(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Télécharger le dossier PDF"
            onClick={() => void downloadPdf(`/pdf/patient/${row.id}`)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Can permission="patient:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer le dossier"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = patientsQuery.data?.meta;
  const isEdit = formTarget !== null && formTarget !== 'new';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        subtitle={`${meta?.total ?? 0} dossier(s) patient enregistré(s) dans la clinique.`}
        actions={
          <Can permission="patient:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouveau patient
            </Button>
          </Can>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <Input
            placeholder="Nom, email, téléphone ou n° d’assurance…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un patient"
          />
          <Select
            options={[
              { value: 'FEMALE', label: 'Femmes' },
              { value: 'MALE', label: 'Hommes' },
              { value: 'OTHER', label: 'Autre' },
            ]}
            placeholder="Tous les genres"
            value={String(filters.gender ?? '')}
            onChange={(event) => update({ gender: event.target.value })}
            aria-label="Filtrer par genre"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={patientsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={patientsQuery.isLoading}
          isError={patientsQuery.isError}
          errorMessage={getApiErrorMessage(patientsQuery.error)}
          onRetry={() => void patientsQuery.refetch()}
          onRowClick={(row) => navigate(`/admin/patients/${row.id}`)}
          emptyTitle="Aucun patient"
          emptyDescription="Aucun dossier ne correspond à votre recherche."
          emptyAction={
            <Can permission="patient:create">
              <Button size="sm" leftIcon={<Users className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Créer un dossier
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

      <PatientFormModal
        isOpen={formTarget !== null}
        patient={isEdit ? (formTarget as Patient) : undefined}
        onClose={() => setFormTarget(null)}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={(payload) => {
          if (isEdit) {
            updateMutation.mutate({ id: (formTarget as Patient).id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer ce dossier patient ?"
        message={
          <>
            Le dossier de{' '}
            <span className="font-semibold">
              {deleteTarget?.first_name} {deleteTarget?.last_name}
            </span>{' '}
            sera définitivement supprimé. Cette action est impossible si le patient possède un
            historique médical ou des factures.
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
/* Formulaire de création / modification                                       */
/* -------------------------------------------------------------------------- */

interface PatientFormValues {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  insuranceNumber: string;
}

const EMPTY_PATIENT: PatientFormValues = {
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: 'FEMALE',
  phone: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  bloodGroup: '',
  allergies: '',
  medicalHistory: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  insuranceNumber: '',
};

function patientToValues(patient: Patient): PatientFormValues {
  return {
    firstName: patient.first_name,
    lastName: patient.last_name,
    birthDate: patient.birth_date.slice(0, 10),
    gender: patient.gender,
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    address: patient.address ?? '',
    city: patient.city ?? '',
    postalCode: patient.postal_code ?? '',
    bloodGroup: patient.blood_group ?? '',
    allergies: patient.allergies ?? '',
    medicalHistory: patient.medical_history ?? '',
    emergencyContactName: patient.emergency_contact_name ?? '',
    emergencyContactPhone: patient.emergency_contact_phone ?? '',
    insuranceNumber: patient.insurance_number ?? '',
  };
}

function PatientFormModal({
  isOpen,
  patient,
  onClose,
  isPending,
  onSubmit,
}: {
  isOpen: boolean;
  patient?: Patient;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState<PatientFormValues>(EMPTY_PATIENT);

  // Réinitialise le formulaire à chaque ouverture (création ou édition).
  useEffect(() => {
    if (!isOpen) return;
    setValues(patient ? patientToValues(patient) : EMPTY_PATIENT);
  }, [isOpen, patient]);

  const handleSubmit = (): void => {
    if (!values.firstName.trim() || !values.lastName.trim() || !values.birthDate) {
      toast.error('Nom, prénom et date de naissance sont obligatoires.');
      return;
    }

    onSubmit({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      birthDate: values.birthDate,
      gender: values.gender,
      phone: values.phone.trim() || undefined,
      email: values.email.trim() || undefined,
      address: values.address.trim() || undefined,
      city: values.city.trim() || undefined,
      postalCode: values.postalCode.trim() || undefined,
      bloodGroup: values.bloodGroup || undefined,
      allergies: values.allergies.trim() || undefined,
      medicalHistory: values.medicalHistory.trim() || undefined,
      emergencyContactName: values.emergencyContactName.trim() || undefined,
      emergencyContactPhone: values.emergencyContactPhone.trim() || undefined,
      insuranceNumber: values.insuranceNumber.trim() || undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={patient ? 'Modifier le dossier patient' : 'Nouveau dossier patient'}
      description={patient ? `Dossier #${patient.id} — ${patient.first_name} ${patient.last_name}` : undefined}
      size="lg"
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {patient ? 'Enregistrer' : 'Créer le dossier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
            label="Date de naissance"
            type="date"
            required
            value={values.birthDate}
            onChange={(event) => setValues({ ...values, birthDate: event.target.value })}
          />
          <Select
            label="Genre"
            options={[
              { value: 'FEMALE', label: 'Femme' },
              { value: 'MALE', label: 'Homme' },
              { value: 'OTHER', label: 'Autre' },
            ]}
            value={values.gender}
            onChange={(event) => setValues({ ...values, gender: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Téléphone"
            type="tel"
            value={values.phone}
            onChange={(event) => setValues({ ...values, phone: event.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={values.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />
        </div>

        <Input
          label="Adresse"
          value={values.address}
          onChange={(event) => setValues({ ...values, address: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Code postal"
            value={values.postalCode}
            onChange={(event) => setValues({ ...values, postalCode: event.target.value })}
          />
          <Input
            label="Ville"
            value={values.city}
            onChange={(event) => setValues({ ...values, city: event.target.value })}
          />
          <Select
            label="Groupe sanguin"
            options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => ({
              value: group,
              label: group,
            }))}
            placeholder="Inconnu"
            value={values.bloodGroup}
            onChange={(event) => setValues({ ...values, bloodGroup: event.target.value })}
          />
        </div>

        <Textarea
          label="Allergies connues"
          rows={2}
          value={values.allergies}
          onChange={(event) => setValues({ ...values, allergies: event.target.value })}
        />

        <Textarea
          label="Antécédents médicaux"
          rows={2}
          value={values.medicalHistory}
          onChange={(event) => setValues({ ...values, medicalHistory: event.target.value })}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Contact d'urgence"
            value={values.emergencyContactName}
            onChange={(event) => setValues({ ...values, emergencyContactName: event.target.value })}
          />
          <Input
            label="Téléphone d'urgence"
            type="tel"
            value={values.emergencyContactPhone}
            onChange={(event) => setValues({ ...values, emergencyContactPhone: event.target.value })}
          />
          <Input
            label="N° d'assurance"
            value={values.insuranceNumber}
            onChange={(event) => setValues({ ...values, insuranceNumber: event.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

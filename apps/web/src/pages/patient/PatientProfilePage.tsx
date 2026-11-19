/**
 * Mon profil (espace patient).
 *
 * Modification des coordonnées et des informations de santé déclaratives
 * (allergies, contact d'urgence).
 */

import { GENDER_LABELS_FR, formatDate, type Patient } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button, Card, CardBody, CardHeader, FieldRow, Input, Spinner, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, apiPatch, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

type EditableFields = Pick<
  Patient,
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'address'
  | 'city'
  | 'postal_code'
  | 'allergies'
  | 'emergency_contact_name'
  | 'emergency_contact_phone'
>;

export default function PatientProfilePage(): JSX.Element {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<EditableFields | null>(null);

  const patientQuery = useQuery({
    queryKey: queryKeys.patients.me,
    queryFn: () => apiGet<Patient>('/patients/me'),
  });

  // Initialise le formulaire au premier chargement.
  useEffect(() => {
    if (patientQuery.data && values === null) {
      const p = patientQuery.data;
      setValues({
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone,
        address: p.address,
        city: p.city,
        postal_code: p.postal_code,
        allergies: p.allergies,
        emergency_contact_name: p.emergency_contact_name,
        emergency_contact_phone: p.emergency_contact_phone,
      });
    }
  }, [patientQuery.data, values]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<Patient>('/patients/me', payload),
    onSuccess: () => {
      toast.success('Profil mis à jour.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.patients.me });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  if (patientQuery.isLoading || values === null) {
    return (
      <div className="space-y-5">
        <PageHeader title="Mon profil" />
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      </div>
    );
  }

  const patient = patientQuery.data;

  const handleSubmit = (): void => {
    mutation.mutate({
      firstName: values.first_name.trim(),
      lastName: values.last_name.trim(),
      phone: values.phone?.trim() || undefined,
      address: values.address?.trim() || undefined,
      city: values.city?.trim() || undefined,
      postalCode: values.postal_code?.trim() || undefined,
      allergies: values.allergies?.trim() || undefined,
      emergencyContactName: values.emergency_contact_name?.trim() || undefined,
      emergencyContactPhone: values.emergency_contact_phone?.trim() || undefined,
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mon profil"
        subtitle="Tenez à jour vos coordonnées pour être joignable par la clinique."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Identité" description="Ces informations figurent sur vos documents médicaux." />
            <CardBody className="space-y-4">
              <FieldRow>
                <Input
                  label="Prénom"
                  leftIcon={<UserCog className="h-4 w-4" />}
                  value={values.first_name}
                  onChange={(event) => setValues({ ...values, first_name: event.target.value })}
                />
                <Input
                  label="Nom"
                  value={values.last_name}
                  onChange={(event) => setValues({ ...values, last_name: event.target.value })}
                />
              </FieldRow>

              <FieldRow>
                <Input label="Date de naissance" value={formatDate(patient?.birth_date)} disabled />
                <Input
                  label="Genre"
                  value={patient ? GENDER_LABELS_FR[patient.gender] : ''}
                  disabled
                />
              </FieldRow>

              <Input
                label="Adresse email"
                value={patient?.email ?? ''}
                disabled
                hint="L’email sert d’identifiant de connexion : contactez le secrétariat pour le modifier."
              />

              <Input
                label="Téléphone"
                type="tel"
                value={values.phone ?? ''}
                onChange={(event) => setValues({ ...values, phone: event.target.value })}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Adresse postale" />
            <CardBody className="space-y-4">
              <Input
                label="Adresse"
                value={values.address ?? ''}
                onChange={(event) => setValues({ ...values, address: event.target.value })}
              />
              <FieldRow>
                <Input
                  label="Code postal"
                  value={values.postal_code ?? ''}
                  onChange={(event) => setValues({ ...values, postal_code: event.target.value })}
                />
                <Input
                  label="Ville"
                  value={values.city ?? ''}
                  onChange={(event) => setValues({ ...values, city: event.target.value })}
                />
              </FieldRow>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Informations de santé"
              description="Communiquez ces éléments au médecin lors de votre prochaine visite."
            />
            <CardBody className="space-y-4">
              <Textarea
                label="Allergies connues"
                rows={3}
                value={values.allergies ?? ''}
                onChange={(event) => setValues({ ...values, allergies: event.target.value })}
                hint="Médicaments, aliments, produits…"
              />
              <FieldRow>
                <Input
                  label="Contact d’urgence"
                  value={values.emergency_contact_name ?? ''}
                  onChange={(event) =>
                    setValues({ ...values, emergency_contact_name: event.target.value })
                  }
                />
                <Input
                  label="Téléphone du contact"
                  type="tel"
                  value={values.emergency_contact_phone ?? ''}
                  onChange={(event) =>
                    setValues({ ...values, emergency_contact_phone: event.target.value })
                  }
                />
              </FieldRow>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <Button
              leftIcon={<Save className="h-4 w-4" />}
              onClick={handleSubmit}
              isLoading={mutation.isPending}
            >
              Enregistrer mes informations
            </Button>
          </div>
        </div>

        <Card className="self-start p-5">
          <h2 className="section-title">Mon dossier</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Numéro de dossier</dt>
              <dd className="font-medium text-slate-900 dark:text-white">#{patient?.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Groupe sanguin</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {patient?.blood_group ?? 'Non renseigné'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">N° d’assurance</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {patient?.insurance_number ?? 'Non renseigné'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Dossier créé le</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {patient ? formatDate(patient.created_at) : '—'}
              </dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
            Le groupe sanguin et le numéro d’assurance ne peuvent être modifiés que par le personnel
            soignant, pour garantir la fiabilité du dossier médical.
          </p>
        </Card>
      </div>
    </div>
  );
}
/**
 * Inscription en ligne d'un patient.
 *
 * La création du compte et du dossier médical sont réalisées dans la même
 * transaction côté API : un échec ne laisse donc jamais de compte orphelin.
 */

import { APP_NAME, GENDER_LABELS_FR, GENDERS, registerPatientSchema, type RegisterPatientInput } from '@mediclinic/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button, Card, FieldRow, Input, Select } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiClient';

export default function RegisterPage(): JSX.Element {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPatientInput>({
    resolver: zodResolver(registerPatientSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      phone: '',
      birthDate: '',
      gender: 'FEMALE',
      address: '',
      city: '',
      postalCode: '',
      insuranceNumber: '',
    },
  });

  const genderOptions = GENDERS.map((gender) => ({ value: gender, label: GENDER_LABELS_FR[gender] }));

  const onSubmit = async (values: RegisterPatientInput): Promise<void> => {
    try {
      await registerAccount(values);
      toast.success('Votre espace patient est créé. Bienvenue !');
      navigate('/patient', { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-base font-bold text-white">
              MC
            </span>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</span>
          </Link>
          <h1 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">Créer mon espace patient</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Prenez rendez-vous en ligne, consultez vos ordonnances et vos factures.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Identité</h2>
              <div className="space-y-4">
                <FieldRow>
                  <Input
                    label="Prénom"
                    error={errors.firstName?.message}
                    required
                    {...register('firstName')}
                  />
                  <Input label="Nom" error={errors.lastName?.message} required {...register('lastName')} />
                </FieldRow>

                <FieldRow>
                  <Input
                    label="Date de naissance"
                    type="date"
                    error={errors.birthDate?.message}
                    required
                    {...register('birthDate')}
                  />
                  <Select
                    label="Genre"
                    options={genderOptions}
                    error={errors.gender?.message}
                    required
                    {...register('gender')}
                  />
                </FieldRow>

                <FieldRow>
                  <Input
                    label="Téléphone"
                    type="tel"
                    placeholder="06 12 34 56 78"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />
                  <Input
                    label="N° d'assurance / mutuelle"
                    placeholder="ASS-000123"
                    error={errors.insuranceNumber?.message}
                    {...register('insuranceNumber')}
                  />
                </FieldRow>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Adresse</h2>
              <div className="space-y-4">
                <Input label="Adresse" error={errors.address?.message} {...register('address')} />
                <FieldRow>
                  <Input
                    label="Code postal"
                    error={errors.postalCode?.message}
                    {...register('postalCode')}
                  />
                  <Input label="Ville" error={errors.city?.message} {...register('city')} />
                </FieldRow>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Identifiants de connexion</h2>
              <div className="space-y-4">
                <Input
                  label="Adresse email"
                  type="email"
                  autoComplete="email"
                  error={errors.email?.message}
                  required
                  {...register('email')}
                />
                <FieldRow>
                  <Input
                    label="Mot de passe"
                    type="password"
                    autoComplete="new-password"
                    hint="8 caractères minimum, avec au moins une lettre et un chiffre."
                    error={errors.password?.message}
                    required
                    {...register('password')}
                  />
                  <Input
                    label="Confirmation"
                    type="password"
                    autoComplete="new-password"
                    error={errors.confirmPassword?.message}
                    required
                    {...register('confirmPassword')}
                  />
                </FieldRow>
              </div>
            </section>

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
              <Link to="/connexion">
                <Button variant="secondary" className="w-full sm:w-auto">
                  J&apos;ai déjà un compte
                </Button>
              </Link>
              <Button type="submit" isLoading={isSubmitting}>
                Créer mon compte
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

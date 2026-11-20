/**
 * Inscription en ligne d'un patient.
 *
 * La création du compte et du dossier médical sont réalisées dans la même
 * transaction côté API : un échec ne laisse donc jamais de compte orphelin.
 */

import {
  APP_NAME,
  GENDERS,
  labelsFor,
  registerPatientSchema,
  type RegisterPatientInput,
} from '@mediclinic/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button, Card, FieldRow, Input, Select } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { getApiErrorMessage } from '@/lib/apiClient';

export default function RegisterPage(): JSX.Element {
  const { register: registerAccount } = useAuth();
  const { t } = useI18n();
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

  const genderOptions = GENDERS.map((gender) => ({ value: gender, label: labelsFor().genders[gender] ?? gender }));

  const onSubmit = async (values: RegisterPatientInput): Promise<void> => {
    try {
      await registerAccount(values);
      toast.success(t('auth.registerSuccess'));
      navigate('/patient', { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-base font-bold text-white">
              MC
            </span>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</span>
          </Link>
          <h1 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">{t('auth.createAccount')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('auth.registerSubtitle')}</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('auth.register.identity')}</h2>
              <div className="space-y-4">
                <FieldRow>
                  <Input
                    label={t('auth.register.firstName')}
                    error={errors.firstName?.message}
                    required
                    {...register('firstName')}
                  />
                  <Input label={t('auth.register.lastName')} error={errors.lastName?.message} required {...register('lastName')} />
                </FieldRow>

                <FieldRow>
                  <Input
                    label={t('auth.register.birthDate')}
                    type="date"
                    error={errors.birthDate?.message}
                    required
                    {...register('birthDate')}
                  />
                  <Select
                    label={t('auth.register.gender')}
                    options={genderOptions}
                    error={errors.gender?.message}
                    required
                    {...register('gender')}
                  />
                </FieldRow>

                <FieldRow>
                  <Input
                    label={t('auth.register.phone')}
                    type="tel"
                    placeholder="06 12 34 56 78"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />
                  <Input
                    label={t('auth.register.insurance')}
                    placeholder="ASS-000123"
                    error={errors.insuranceNumber?.message}
                    {...register('insuranceNumber')}
                  />
                </FieldRow>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('auth.register.address')}</h2>
              <div className="space-y-4">
                <Input label={t('auth.register.addressLine')} error={errors.address?.message} {...register('address')} />
                <FieldRow>
                  <Input
                    label={t('auth.register.postalCode')}
                    error={errors.postalCode?.message}
                    {...register('postalCode')}
                  />
                  <Input label={t('auth.register.city')} error={errors.city?.message} {...register('city')} />
                </FieldRow>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t('auth.register.credentials')}</h2>
              <div className="space-y-4">
                <Input
                  label={t('auth.email')}
                  type="email"
                  autoComplete="email"
                  error={errors.email?.message}
                  required
                  {...register('email')}
                />
                <FieldRow>
                  <Input
                    label={t('auth.password')}
                    type="password"
                    autoComplete="new-password"
                    hint={t('auth.register.passwordHint')}
                    error={errors.password?.message}
                    required
                    {...register('password')}
                  />
                  <Input
                    label={t('auth.register.confirm')}
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
                  {t('auth.haveAccount')}
                </Button>
              </Link>
              <Button type="submit" isLoading={isSubmitting}>
                {t('auth.signUp')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

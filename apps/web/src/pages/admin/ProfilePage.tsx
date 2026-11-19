/**
 * Profil de l'utilisateur connecté (back-office).
 *
 * Permet de modifier ses informations personnelles et de changer son mot de
 * passe. Le changement de mot de passe révoque toutes les sessions : une
 * reconnexion est donc nécessaire.
 */

import { ROLE_LABELS_FR, changePasswordSchema, updateProfileSchema, type RoleCode, type User } from '@mediclinic/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Save, ShieldCheck, UserCog } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';

import { Badge, Button, Card, CardBody, CardHeader, FieldRow, Input } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { initialsFrom } from '@/lib/utils';

type ProfileInput = z.infer<typeof updateProfileSchema>;
type PasswordInput = z.infer<typeof changePasswordSchema>;

export default function ProfilePage(): JSX.Element {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const profileQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiGet<User>('/users/me/profile'),
  });

  const profile = profileQuery.data ?? user;

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: profile?.first_name ?? '',
      lastName: profile?.last_name ?? '',
      phone: profile?.phone ?? '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<PasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ProfileInput) => apiPatch<User>('/users/me/profile', payload),
    onSuccess: async () => {
      toast.success('Profil mis à jour.');
      await refreshUser();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: (payload: PasswordInput) =>
      apiPost<{ message: string }>('/auth/change-password', {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
        confirmPassword: payload.confirmPassword,
      }),
    onSuccess: async () => {
      toast.success('Mot de passe modifié. Reconnectez-vous avec le nouveau.');
      resetPasswordForm();
      await logout();
      navigate('/connexion', { replace: true });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Mon profil" subtitle="Vos informations personnelles et vos identifiants de connexion." />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Carte d'identité */}
        <Card className="self-start p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">
              {profile ? initialsFrom(profile.first_name, profile.last_name) : '??'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile?.email}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Rôles
            </p>
            <div className="flex flex-wrap gap-1">
              {(profile?.roles ?? []).map((role) => (
                <Badge key={role} tone="brand">
                  {ROLE_LABELS_FR[role as RoleCode] ?? role}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Permissions effectives
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {profile?.permissions.length ?? 0} permission(s) accordée(s)
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-brand-700 dark:text-brand-400">
                Voir le détail
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {(profile?.permissions ?? []).map((permission) => (
                  <code
                    key={permission}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {permission}
                  </code>
                ))}
              </div>
            </details>
          </div>
        </Card>

        <div className="space-y-5">
          {/* Informations personnelles */}
          <Card>
            <CardHeader
              title="Informations personnelles"
              description="Ces données apparaissent dans le journal d’audit."
            />
            <CardBody>
              <form
                onSubmit={handleProfileSubmit((values) => updateMutation.mutate(values))}
                className="space-y-4"
                noValidate
              >
                <FieldRow>
                  <Input
                    label="Prénom"
                    leftIcon={<UserCog className="h-4 w-4" />}
                    error={profileErrors.firstName?.message}
                    {...registerProfile('firstName')}
                  />
                  <Input
                    label="Nom"
                    error={profileErrors.lastName?.message}
                    {...registerProfile('lastName')}
                  />
                </FieldRow>

                <Input
                  label="Adresse email"
                  value={profile?.email ?? ''}
                  disabled
                  hint="L’email sert d’identifiant : contactez un administrateur pour le modifier."
                />

                <Input
                  label="Téléphone"
                  type="tel"
                  error={profileErrors.phone?.message}
                  {...registerProfile('phone')}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    leftIcon={<Save className="h-4 w-4" />}
                    isLoading={isProfileSubmitting || updateMutation.isPending}
                  >
                    Enregistrer
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {/* Mot de passe */}
          <Card>
            <CardHeader
              title="Mot de passe"
              description="8 caractères minimum, avec au moins une lettre et un chiffre."
            />
            <CardBody>
              <form
                onSubmit={handlePasswordSubmit((values) => passwordMutation.mutate(values))}
                className="space-y-4"
                noValidate
              >
                <Input
                  label="Mot de passe actuel"
                  type="password"
                  autoComplete="current-password"
                  leftIcon={<KeyRound className="h-4 w-4" />}
                  error={passwordErrors.currentPassword?.message}
                  required
                  {...registerPassword('currentPassword')}
                />

                <FieldRow>
                  <Input
                    label="Nouveau mot de passe"
                    type="password"
                    autoComplete="new-password"
                    error={passwordErrors.newPassword?.message}
                    required
                    {...registerPassword('newPassword')}
                  />
                  <Input
                    label="Confirmation"
                    type="password"
                    autoComplete="new-password"
                    error={passwordErrors.confirmPassword?.message}
                    required
                    {...registerPassword('confirmPassword')}
                  />
                </FieldRow>

                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Le changement de mot de passe déconnecte toutes vos sessions actives, y compris sur
                  d’autres appareils.
                </p>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    leftIcon={<KeyRound className="h-4 w-4" />}
                    isLoading={isPasswordSubmitting || passwordMutation.isPending}
                  >
                    Modifier le mot de passe
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

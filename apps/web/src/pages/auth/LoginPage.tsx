/**
 * Page de connexion.
 *
 * Un seul formulaire pour les trois publics (patient, personnel, administrateur) :
 * l'utilisateur est redirigé vers son espace selon ses rôles après connexion.
 * Le lien de destination d'origine (`state.from`) est respecté, ce qui permet
 * d'accéder directement à une page protégée après authentification.
 */

import { APP_NAME, loginSchema, type LoginInput } from '@mediclinic/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiClient';

interface LocationState {
  from?: string;
}

export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginInput): Promise<void> => {
    try {
      const user = await login(values.email, values.password);
      toast.success(`Bienvenue ${user.first_name} !`);

      const state = location.state as LocationState | null;
      const isStaff = user.roles.some((role) => role !== 'PATIENT');
      const fallback = isStaff ? '/admin' : '/patient';
      navigate(state?.from ?? fallback, { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-base font-bold text-white">
              MC
            </span>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</span>
          </Link>
          <h1 className="mt-5 text-xl font-semibold text-slate-900 dark:text-white">Connexion à votre espace</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Patients, personnel soignant et administrateurs
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label="Adresse email"
              type="email"
              autoComplete="email"
              placeholder="prenom.nom@mediclinic.fr"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              required
              {...register('email')}
            />

            <div>
              <Input
                label="Mot de passe"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                leftIcon={<Lock className="h-4 w-4" />}
                error={errors.password?.message}
                required
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700 dark:text-slate-400"
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPassword ? 'Masquer' : 'Afficher'} le mot de passe
              </button>
            </div>

            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Se connecter
            </Button>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-4 text-center text-sm dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Pas encore de compte patient ?</p>
            <Link to="/inscription" className="link mt-1 inline-block">
              Créer mon espace patient
            </Link>
          </div>
        </Card>

        {/* Comptes de démonstration : aide à la soutenance */}
        <Card className="mt-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Comptes de démonstration
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Mot de passe commun : <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">Passw0rd!2026</code>
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li>
              <span className="font-medium">Super administrateur :</span> superadmin@mediclinic.fr
            </li>
            <li>
              <span className="font-medium">Médecin :</span> amine.haddad@mediclinic.fr
            </li>
            <li>
              <span className="font-medium">Pharmacien :</span> paul.mercier@mediclinic.fr
            </li>
            <li>
              <span className="font-medium">Comptable :</span> hugo.charpentier@mediclinic.fr
            </li>
            <li>
              <span className="font-medium">Patient :</span> lucie.durand@email.fr
            </li>
          </ul>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/" className="hover:text-brand-700">
            ← Retour au site public
          </Link>
        </p>
      </div>
    </div>
  );
}

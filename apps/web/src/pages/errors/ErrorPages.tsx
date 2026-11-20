/**
 * Pages d'erreur : accès refusé et page introuvable.
 */

import { Home, Lock, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

/** Page affichée lorsqu'un utilisateur n'a pas les droits requis. */
export function ForbiddenPage(): JSX.Element {
  const { user, isPatient } = useAuth();
  const { t } = useI18n();
  const homeLink = user ? (isPatient ? '/patient' : '/admin') : '/';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-lg p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <Lock className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{t('error.forbiddenTitle')}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('error.forbiddenMessage')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={homeLink}>
            <Button leftIcon={<Home className="h-4 w-4" />}>{t('error.backSpace')}</Button>
          </Link>
          <Link to="/">
            <Button variant="secondary">{t('nav.home')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

/** Page 404. */
export function NotFoundPage(): JSX.Element {
  const { user, isPatient } = useAuth();
  const { t } = useI18n();
  const homeLink = user ? (isPatient ? '/patient' : '/admin') : '/';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-lg p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <SearchX className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-4 text-4xl font-bold text-slate-900 dark:text-white">404</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{t('error.notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('error.notFoundMessage')}</p>
        <div className="mt-6 flex justify-center">
          <Link to={homeLink}>
            <Button leftIcon={<Home className="h-4 w-4" />}>{t('error.backHome')}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

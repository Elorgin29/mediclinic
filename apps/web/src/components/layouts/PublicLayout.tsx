/**
 * Gabarit du site public : en-tête, navigation, pied de page.
 * Utilisé par l'accueil, l'annuaire des médecins, la prise de rendez-vous et
 * la demande de téléconsultation.
 */

import { APP_NAME } from '@mediclinic/shared';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { CLINIC_CONTACT } from '@/lib/clinic';
import { PUBLIC_NAV } from '@/routes/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks';

export function PublicLayout(): JSX.Element {
  const { user, isStaff } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Ferme le menu mobile à chaque changement de page.
  useEffect(() => setIsMenuOpen(false), [location.pathname]);

  const portalLink = user ? (isStaff ? '/admin' : '/patient') : '/connexion';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              MC
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link to={portalLink} className="hidden sm:block">
              <Button size="sm" variant={user ? 'secondary' : 'primary'}>
                {user ? 'Mon espace' : 'Se connecter'}
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label={isMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {isMenuOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-900">
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-lg px-3 py-2 text-sm font-medium',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'text-slate-600 dark:text-slate-300',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li className="pt-2">
                <Link to={portalLink}>
                  <Button className="w-full" size="sm">
                    {user ? 'Mon espace' : 'Se connecter'}
                  </Button>
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">{APP_NAME}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Plateforme de gestion de clinique médicale : prise de rendez-vous en ligne, dossier patient
              informatisé, téléconsultation, pharmacie et facturation.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Navigation</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-500 dark:text-slate-400">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-brand-700 dark:hover:text-brand-400">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Nous contacter</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-500 dark:text-slate-400">
              <li>{CLINIC_CONTACT.address}</li>
              <li>Tél. {CLINIC_CONTACT.phone}</li>
              <li>{CLINIC_CONTACT.email}</li>
              <li>Urgences : 24h/24, 7j/7</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400 dark:border-slate-800">
          © {new Date().getFullYear()} {APP_NAME} — Projet académique de gestion de clinique médicale.
        </div>
      </footer>
    </div>
  );
}

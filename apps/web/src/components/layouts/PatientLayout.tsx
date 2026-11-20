/**
 * Gabarit de l'espace patient.
 *
 * Navigation horizontale adaptée à un usage grand public : rendez-vous, dossier
 * médical, ordonnances, factures, téléconsultations et profil.
 */

import { APP_NAME } from '@mediclinic/shared';
import { Bell, LogOut, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Button, CountBadge } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn, initialsFrom } from '@/lib/utils';
import { useTheme } from '@/hooks';
import { PATIENT_NAV } from '@/routes/navigation';

export function PatientLayout(): JSX.Element {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });

  useEffect(() => setIsMenuOpen(false), [location.pathname]);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/connexion', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/patient" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              MC
            </span>
            <span className="hidden text-base font-bold text-slate-900 sm:block dark:text-white">
              {APP_NAME} — Mon espace
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link to="/patient/notifications" className="relative">
              <Button variant="ghost" size="icon" aria-label="Mes notifications">
                <Bell className="h-4 w-4" />
              </Button>
              {(unreadQuery.data?.count ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5">
                  <CountBadge count={unreadQuery.data?.count ?? 0} />
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-expanded={isMenuOpen}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                {user ? initialsFrom(user.first_name, user.last_name) : '??'}
              </span>
              <span className="hidden text-sm font-medium text-slate-700 sm:block dark:text-slate-200">
                {user?.first_name}
              </span>
            </button>

            <Button variant="ghost" size="icon" onClick={() => void handleLogout()} aria-label="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation de l'espace patient */}
        <nav className="border-t border-slate-200 dark:border-slate-800" aria-label="Navigation de l'espace patient">
          <style>{`
            .patient-nav-scrollbar {
              scrollbar-width: thin;
              scrollbar-color: #94a3b8 transparent;
            }
            .patient-nav-scrollbar::-webkit-scrollbar {
              height: 6px;
            }
            .patient-nav-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .patient-nav-scrollbar::-webkit-scrollbar-thumb {
              border-radius: 9999px;
              background: #94a3b8;
            }
            .patient-nav-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #64748b;
            }
            .dark .patient-nav-scrollbar {
              scrollbar-color: #475569 transparent;
            }
            .dark .patient-nav-scrollbar::-webkit-scrollbar-thumb {
              background: #475569;
            }
            .dark .patient-nav-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #64748b;
            }
          `}</style>
          <div className="patient-nav-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto overflow-y-hidden px-4 sm:px-6">
            {PATIENT_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        {APP_NAME} — vos données médicales sont confidentielles et accessibles uniquement aux professionnels
        autorisés. En cas d’urgence vitale, appelez le 15.
      </footer>
    </div>
  );
}

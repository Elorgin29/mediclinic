/**
 * Gabarit du back-office.
 *
 * La barre latérale est construite à partir de `ADMIN_NAV` filtré par les
 * permissions effectives : chaque membre du personnel ne voit que les modules
 * auxquels il a droit. Les pastilles de comptage (téléconsultations en attente,
 * stock faible, notifications non lues) sont alimentées par l'API.
 */

import { APP_NAME, ROLE_LABELS_FR, type DashboardPayload, type RoleCode } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, Menu, Moon, Sun, UserCog, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Badge, Button, CountBadge, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn, initialsFrom } from '@/lib/utils';
import { useTheme } from '@/hooks';
import { ADMIN_NAV } from '@/routes/navigation';

/** Compteurs affichés dans le menu. */
interface NavBadges {
  pendingMeetings: number;
  lowStock: number;
  overdueInvoices: number;
  unreadNotifications: number;
}

export function AdminLayout(): JSX.Element {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /* Compteurs                                                           */
  /* ------------------------------------------------------------------ */
  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => apiGet<DashboardPayload>('/dashboard/stats'),
    enabled: hasPermission('dashboard:read'),
    refetchInterval: 120_000,
  });

  const badges: NavBadges = {
    pendingMeetings: statsQuery.data?.stats.pendingMeetings ?? 0,
    lowStock: statsQuery.data?.stats.lowStockCount ?? 0,
    // Les factures en retard ne figurent pas dans les statistiques du tableau de
    // bord : l'écran de facturation expose son propre compteur.
    overdueInvoices: 0,
    unreadNotifications: unreadQuery.data?.count ?? 0,
  };

  /* ------------------------------------------------------------------ */
  /* Comportements                                                       */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    setIsSidebarOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  // Fermeture du menu utilisateur au clic extérieur.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/connexion', { replace: true });
  };

  const primaryRole = user?.roles[0] as RoleCode | undefined;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ---------------------------------------------------------------- */}
      {/* Barre latérale                                                    */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navigation du back-office"
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-5 dark:border-slate-800">
          <Link to="/admin" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              MC
            </span>
            <span className="text-base font-bold text-slate-900 dark:text-white">{APP_NAME}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="px-3 py-4">
          {ADMIN_NAV.map((group) => {
            const visibleItems = group.items.filter((item) => hasPermission(item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="mb-4">
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const badgeValue = item.badgeKey ? badges[item.badgeKey] : undefined;
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.exact}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                            )
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {badgeValue !== undefined && badgeValue > 0 && <CountBadge count={badgeValue} />}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Voile sur mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          role="presentation"
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Contenu                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden sm:block">
              <p className="text-xs text-slate-500 dark:text-slate-400">Clinique MediClinic</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {ROLE_LABELS_FR[primaryRole ?? 'PATIENT'] ?? 'Espace professionnel'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link to="/admin/notifications" className="relative">
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              {badges.unreadNotifications > 0 && (
                <span className="absolute -right-0.5 -top-0.5">
                  <CountBadge count={badges.unreadNotifications} />
                </span>
              )}
            </Link>

            {/* Menu utilisateur */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen((open) => !open)}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                  {user ? initialsFrom(user.first_name, user.last_name) : '??'}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{user?.email}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
              </button>

              {isUserMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {user?.first_name} {user?.last_name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user?.roles.map((role) => (
                        <Badge key={role} tone="brand">
                          {ROLE_LABELS_FR[role as RoleCode] ?? role}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-1.5">
                    <Link
                      to="/admin/mon-profil"
                      role="menuitem"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <UserCog className="h-4 w-4" aria-hidden />
                      Mon profil
                    </Link>
                    <Link
                      to="/"
                      role="menuitem"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden />
                      Voir le site public
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      Se déconnecter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Indicateur de chargement discret lors du rafraîchissement des compteurs */}
        {statsQuery.isFetching && (
          <div className="flex items-center gap-2 border-b border-slate-200 bg-brand-50/60 px-4 py-1 text-xs text-brand-800 sm:px-6 dark:border-slate-800 dark:bg-brand-950/40 dark:text-brand-300">
            <Spinner className="h-3 w-3" />
            Actualisation des indicateurs…
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

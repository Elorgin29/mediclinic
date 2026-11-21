/**
 * Gabarit du back-office.
 *
 * La barre latérale est fixe sur grand écran et peut être réduite au seul
 * monogramme (préférence persistée dans localStorage). Sur mobile, elle reste
 * un tiroir superposé. Elle est construite à partir de `ADMIN_NAV` filtré par
 * les permissions effectives.
 */

import { APP_NAME, localizedRoleLabel, type DashboardPayload } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserCog,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Badge, Button, CountBadge, Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
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

const SIDEBAR_KEY = 'mediclinic.sidebar.collapsed';

export function AdminLayout(): JSX.Element {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
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

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0');
    } catch {
      // Préférence non persistée si le stockage est indisponible.
    }
  }, [isCollapsed]);

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

  const primaryRole = user?.roles[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ---------------------------------------------------------------- */}
      {/* Barre latérale fixe                                               */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width,transform] duration-200 dark:border-slate-800 dark:bg-slate-900',
          isCollapsed ? 'lg:w-20' : 'lg:w-72',
          'w-72',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label={t('layout.admin.openMenu', 'Navigation du back-office')}
      >
        {/* En-tête : le monogramme et le bouton de repli sont alignés sur le
            même axe vertical. Quand la barre est réduite, le bouton passe sous
            le logo pour rester cliquable sans chevaucher celui-ci. */}
        <div className="relative flex h-16 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-800">
          <Link
            to="/admin"
            className={cn('flex min-w-0 items-center gap-2.5', isCollapsed ? 'mx-auto' : 'pr-10')}
            title={APP_NAME}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              MC
            </span>
            {!isCollapsed && (
              <span className="truncate text-base font-bold text-slate-900 dark:text-white">{APP_NAME}</span>
            )}
          </Link>

          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 lg:inline-flex"
              onClick={() => setIsCollapsed(true)}
              aria-label={t('layout.admin.collapse')}
              title={t('layout.admin.collapse')}
            >
              <PanelLeftClose className="h-5 w-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isCollapsed && (
          <div className="flex shrink-0 justify-center border-b border-slate-100 py-1.5 dark:border-slate-800">
            <Button
              variant="ghost"
              size="icon"
              className="lg:inline-flex"
              onClick={() => setIsCollapsed(false)}
              aria-label={t('layout.admin.expand')}
              title={t('layout.admin.expand')}
            >
              <PanelLeftOpen className="h-5 w-5" />
            </Button>
          </div>
        )}

        <nav className={cn('flex-1 overflow-y-auto py-4', isCollapsed ? 'px-2' : 'px-3')}>
          {ADMIN_NAV.map((group) => {
            const visibleItems = group.items.filter((item) => hasPermission(item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="mb-4">
                {!isCollapsed && (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t(group.labelKey, group.title)}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const badgeValue = item.badgeKey ? badges[item.badgeKey] : undefined;
                    const label = t(item.labelKey, item.label);
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.exact}
                          title={isCollapsed ? label : undefined}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
                              isCollapsed ? 'justify-center px-2' : 'px-3',
                              isActive
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                            )
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                          {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
                          {!isCollapsed && badgeValue !== undefined && badgeValue > 0 && (
                            <CountBadge count={badgeValue} />
                          )}
                          {isCollapsed && badgeValue !== undefined && badgeValue > 0 && (
                            <span className="absolute right-1 top-1">
                              <CountBadge count={badgeValue} />
                            </span>
                          )}
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
      <div
        className={cn(
          'flex min-w-0 flex-col transition-[padding] duration-200',
          isCollapsed ? 'lg:pl-20' : 'lg:pl-72',
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
              aria-label={t('layout.admin.openMenu')}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden sm:block">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('layout.admin.clinic', 'Clinique MediClinic')}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {localizedRoleLabel(primaryRole)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={t(theme === 'dark' ? 'common.theme.light' : 'common.theme.dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link to="/admin/notifications" className="relative">
              <Button variant="ghost" size="icon" aria-label={t('common.notifications')}>
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
                          {localizedRoleLabel(role)}
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
                      {t('common.profile')}
                    </Link>
                    <Link
                      to="/"
                      role="menuitem"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden />
                      {t('common.publicSite')}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      {t('common.logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {statsQuery.isFetching && (
          <div className="flex items-center gap-2 border-b border-slate-200 bg-brand-50/60 px-4 py-1 text-xs text-brand-800 sm:px-6 dark:border-slate-800 dark:bg-brand-950/40 dark:text-brand-300">
            <Spinner className="h-3 w-3" />
            {t('common.refreshing')}
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

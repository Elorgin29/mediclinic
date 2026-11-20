/**
 * Gabarit du site public : bandeau d'informations, en-tête, navigation,
 * pied de page riche.
 *
 * Utilisé par l'accueil, l'annuaire des médecins, la prise de rendez-vous,
 * la téléconsultation et les pages institutionnelles.
 */

import { APP_NAME } from '@mediclinic/shared';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  HeartPulse,
  Mail,
  MapPin,
  Menu,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { CLINIC_CONTACT } from '@/lib/clinic';
import { PUBLIC_FOOTER_NAV, PUBLIC_NAV } from '@/routes/navigation';
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
      {/* Bandeau d'informations pratiques */}
      <div className="hidden border-b border-brand-900/10 bg-brand-800 text-white lg:block dark:border-white/5 dark:bg-brand-950">
        <div className="public-container flex h-9 items-center justify-between gap-6 text-[11px] font-medium">
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3 w-3 opacity-80" aria-hidden />
              {CLINIC_CONTACT.address}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 opacity-80" aria-hidden />
              Lun–Ven 8h–19h · Sam 9h–13h
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a href={`tel:${CLINIC_CONTACT.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-brand-100">
              <Phone className="h-3 w-3 opacity-80" aria-hidden />
              {CLINIC_CONTACT.phone}
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-rose-100">
              <HeartPulse className="h-3 w-3" aria-hidden />
              Urgences 24h/24 : {CLINIC_CONTACT.emergencyPhone}
            </span>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="public-container flex h-[4.5rem] items-center justify-between gap-4">
          <Link to="/" className="group flex items-center gap-3" aria-label={`${APP_NAME} — accueil`}>
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-glow transition-transform group-hover:scale-105">
              <HeartPulse className="h-5 w-5" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                {APP_NAME}
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-400">
                Clinique pluridisciplinaire
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navigation principale">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={cn(
                        'absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-600 transition-opacity dark:bg-brand-400',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Link to={portalLink} className="hidden md:block">
              <Button size="sm" variant="ghost">
                {user ? 'Mon espace' : 'Se connecter'}
              </Button>
            </Link>

            <Link to="/rendez-vous" className="hidden sm:block">
              <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                Prendre rendez-vous
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
          <nav
            className="border-t border-slate-200 bg-white px-4 py-4 lg:hidden dark:border-slate-800 dark:bg-slate-950"
            aria-label="Navigation mobile"
          >
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'text-slate-600 dark:text-slate-300',
                      )
                    }
                  >
                    {item.label}
                    <ArrowRight className="h-4 w-4 opacity-40" aria-hidden />
                  </NavLink>
                </li>
              ))}
            </ul>

            <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Link to="/rendez-vous">
                <Button className="w-full" leftIcon={<CalendarCheck className="h-4 w-4" />}>
                  Prendre rendez-vous
                </Button>
              </Link>
              <Link to={portalLink}>
                <Button className="w-full" variant="secondary">
                  {user ? 'Mon espace' : 'Se connecter'}
                </Button>
              </Link>
              <a
                href={`tel:${CLINIC_CONTACT.emergencyPhone.replace(/\s/g, '')}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              >
                <HeartPulse className="h-4 w-4" aria-hidden />
                Urgences : {CLINIC_CONTACT.emergencyPhone}
              </a>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="public-container grid gap-10 py-14 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white">
                <HeartPulse className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Une clinique pluridisciplinaire à taille humaine, avec un parcours de soin entièrement
              numérique : rendez-vous, téléconsultation, dossier médical et facturation.
            </p>

            <div className="mt-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                {CLINIC_CONTACT.address}
              </p>
              <a href={`tel:${CLINIC_CONTACT.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 hover:text-brand-700 dark:hover:text-brand-400">
                <Phone className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                {CLINIC_CONTACT.phone}
              </a>
              <a href={`mailto:${CLINIC_CONTACT.email}`} className="flex items-center gap-2 hover:text-brand-700 dark:hover:text-brand-400">
                <Mail className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                {CLINIC_CONTACT.email}
              </a>
            </div>

            <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Données de santé hébergées en France
            </div>
          </div>

          {PUBLIC_FOOTER_NAV.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{column.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
                {column.items.map((item) => (
                  <li key={`${column.title}-${item.to}-${item.label}`}>
                    <Link to={item.to} className="transition-colors hover:text-brand-700 dark:hover:text-brand-400">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="public-container flex flex-col items-center justify-between gap-3 py-5 text-xs text-slate-400 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {APP_NAME} — Projet académique de gestion de clinique médicale.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/mentions-legales" className="hover:text-brand-700 dark:hover:text-brand-400">
                Mentions légales
              </Link>
              <Link to="/mentions-legales#confidentialite" className="hover:text-brand-700 dark:hover:text-brand-400">
                Confidentialité
              </Link>
              <Link to="/faq" className="hover:text-brand-700 dark:hover:text-brand-400">
                Aide
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

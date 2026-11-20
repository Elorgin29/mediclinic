/**
 * Briques d'interface du site public.
 *
 * Elles garantissent une identité visuelle homogène sur toutes les pages
 * vitrines : bandeau d'ouverture, titres de section et étiquettes.
 */

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

export interface PageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Fil d'Ariane affiché au-dessus du titre. */
  breadcrumb?: Array<{ label: string; to?: string }>;
  /** Contenu additionnel (cartes, chiffres…) affiché sous le texte. */
  children?: ReactNode;
  className?: string;
}

/** Bandeau d'ouverture commun aux pages publiques secondaires. */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  children,
  className,
}: PageHeroProps): JSX.Element {
  return (
    <section
      className={cn(
        'hero-mesh relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-white via-brand-50/40 to-slate-50 dark:border-slate-800 dark:from-slate-950 dark:via-brand-950/20 dark:to-slate-950',
        className,
      )}
    >
      <div className="pattern-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="public-container relative py-14 sm:py-20">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Fil d’Ariane" className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-brand-700 dark:hover:text-brand-400">
              Accueil
            </Link>
            {breadcrumb.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" aria-hidden />
                {item.to ? (
                  <Link to={item.to} className="hover:text-brand-700 dark:hover:text-brand-400">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="max-w-3xl animate-fade-up">
          {eyebrow !== undefined && <p className="section-eyebrow">{eyebrow}</p>}
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
            {title}
          </h1>
          {description !== undefined && (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              {description}
            </p>
          )}
          {actions !== undefined && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        </div>

        {children !== undefined && <div className="mt-12 animate-fade-up animation-delay-200">{children}</div>}
      </div>
    </section>
  );
}

export interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  actions?: ReactNode;
  className?: string;
}

/** Titre de section avec sur-titre et texte d'accompagnement. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  actions,
  className,
}: SectionHeadingProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-6',
        align === 'center' && 'flex-col items-center text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow !== undefined && <p className="section-eyebrow">{eyebrow}</p>}
        <h2 className="section-heading">{title}</h2>
        {description !== undefined && (
          <p className={cn('section-lead', align === 'center' && 'mx-auto')}>{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Petit indicateur chiffré utilisé dans les bandeaux publics. */
export function HeroStat({ value, label }: { value: ReactNode; label: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
      <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

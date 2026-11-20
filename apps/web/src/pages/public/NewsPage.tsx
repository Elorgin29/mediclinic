/**
 * Actualités santé : liste éditoriale avec article à la une.
 */

import { ArrowRight, CalendarDays, Clock, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import { PageHero } from '@/components/public/PageHero';
import { ARTICLES } from '@/lib/articles';
import { formatDate } from '@mediclinic/shared';

export default function NewsPage(): JSX.Element {
  const [featured, ...rest] = ARTICLES;

  return (
    <div>
      <PageHero
        eyebrow="Actualités & conseils"
        title={
          <>
            La santé, <span className="gradient-text">expliquée simplement</span>
          </>
        }
        description="Conseils pratiques, prévention et actualités de la clinique, rédigés par nos praticiens et notre équipe soignante."
        breadcrumb={[{ label: 'Actualités' }]}
      />

      <section className="public-container py-14 sm:py-20">
        {featured && (
          <Link to={`/actualites/${featured.slug}`} className="group block">
            <Card className="overflow-hidden p-0 transition-shadow group-hover:shadow-card-hover lg:grid lg:grid-cols-2">
              <div className="hero-mesh relative flex min-h-[16rem] flex-col justify-between border-b border-slate-200 bg-gradient-to-br from-brand-50 to-white p-8 dark:border-slate-800 dark:from-brand-950/40 dark:to-slate-900 lg:border-b-0 lg:border-r">
                <div className="pattern-grid absolute inset-0 opacity-60" aria-hidden />
                <div className="relative flex items-center gap-2">
                  <Badge tone="brand">À la une</Badge>
                  <Badge tone="neutral">{featured.category}</Badge>
                </div>
                <div className="relative mt-10">
                  <Newspaper className="h-10 w-10 text-brand-700/60 dark:text-brand-400/60" aria-hidden />
                  <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {featured.author} · {formatDate(featured.date)}
                  </p>
                </div>
              </div>

              <div className="p-8">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {formatDate(featured.date)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {featured.readTime} min de lecture
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 group-hover:text-brand-800 dark:text-white">
                  {featured.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {featured.excerpt}
                </p>
                <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-400">
                  Lire l’article
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
              </div>
            </Card>
          </Link>
        )}

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((article) => (
            <Link key={article.slug} to={`/actualites/${article.slug}`} className="group">
              <Card className="card-hover flex h-full flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="neutral">{article.category}</Badge>
                  <span className="text-[11px] text-slate-400">{article.readTime} min</span>
                </div>
                <h3 className="mt-3 text-base font-semibold leading-snug text-slate-900 group-hover:text-brand-800 dark:text-white">
                  {article.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {article.excerpt}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span>{formatDate(article.date)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-brand-700 dark:text-brand-400">
                    Lire
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="mt-10 flex flex-col items-center justify-between gap-4 p-6 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Envie de recevoir nos conseils ?</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Créez votre espace patient pour retrouver vos documents et nos recommandations personnalisées.
            </p>
          </div>
          <Link to="/inscription">
            <Button>Créer mon espace</Button>
          </Link>
        </Card>
      </section>
    </div>
  );
}

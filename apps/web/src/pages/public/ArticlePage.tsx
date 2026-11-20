/**
 * Détail d'un article du blog santé.
 */

import { formatDate } from '@mediclinic/shared';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import { PageHero } from '@/components/public/PageHero';
import { usePublicArticle, usePublicArticles } from '@/lib/news';

export default function ArticlePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { article, isLoading } = usePublicArticle(slug);
  const { articles } = usePublicArticles();

  if (isLoading) {
    return (
      <div className="public-container py-20 text-center text-sm text-slate-500 dark:text-slate-400">
        Chargement de l’article…
      </div>
    );
  }

  if (!article) {
    return (
      <div className="public-container py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
          Article introuvable
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
          Cet article n’existe pas ou a été déplacé.
        </h1>
        <Link to="/actualites" className="mt-6 inline-block">
          <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Retour aux actualités
          </Button>
        </Link>
      </div>
    );
  }

  const related = articles.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <div>
      <PageHero
        eyebrow={article.category}
        title={article.title}
        description={article.excerpt}
        breadcrumb={[{ label: 'Actualités', to: '/actualites' }, { label: article.category }]}
      >
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="h-4 w-4" aria-hidden />
            {article.author}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {formatDate(article.date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden />
            {article.readTime} min de lecture
          </span>
        </div>
      </PageHero>

      <section className="public-container py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <article className="prose-clinic max-w-3xl">
            {article.content.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}

            <div className="mt-8 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 dark:border-brand-900 dark:bg-brand-950/40">
              <h2 className="mt-0 text-base font-semibold text-brand-900 dark:text-brand-200">À retenir</h2>
              <ul className="mt-3 space-y-2">
                {article.keyPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-brand-900/90 dark:text-brand-200/90">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-8 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Cet article est fourni à titre informatif et ne remplace pas une consultation médicale.
              En cas de doute ou de symptôme persistant, consultez un professionnel de santé.
            </p>

            <div className="mt-8">
              <Link to="/actualites">
                <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                  Tous les articles
                </Button>
              </Link>
            </div>
          </article>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <Badge tone="brand">{article.category}</Badge>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">Besoin d’un avis médical ?</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Prenez rendez-vous avec un praticien de la clinique ou demandez une téléconsultation.
              </p>
              <Link to="/rendez-vous" className="mt-4 block">
                <Button size="sm" className="w-full">
                  Prendre rendez-vous
                </Button>
              </Link>
              <Link to="/teleconsultation" className="mt-2 block">
                <Button size="sm" variant="secondary" className="w-full">
                  Téléconsultation
                </Button>
              </Link>
            </Card>

            <Card className="p-5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">À lire aussi</p>
              <ul className="mt-3 space-y-3">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/actualites/${item.slug}`}
                      className="block text-xs font-medium leading-snug text-slate-700 hover:text-brand-700 dark:text-slate-200 dark:hover:text-brand-400"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.readTime} min de lecture</p>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </section>
    </div>
  );
}

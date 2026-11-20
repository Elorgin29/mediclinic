/**
 * Actualités — gestion éditoriale du site public.
 *
 * Création, modification, publication et suppression des articles affichés sur
 * la page « Actualités » et à l'accueil. Le rôle RÉDACTEUR dispose uniquement
 * des permissions `news:*` et peut donc travailler depuis cet écran sans accéder
 * aux autres modules cliniques.
 */

import {
  formatDate,
  type NewsArticle,
  type NewsStatus,
  type Paginated,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FilePlus2, Newspaper, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Spinner,
  StatCard,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

const STATUS_LABELS: Record<NewsStatus, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
};

/** Transforme une date SQL en valeur utilisable par `<input type="datetime-local">`. */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function NewsAdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [formTarget, setFormTarget] = useState<NewsArticle | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NewsArticle | null>(null);

  const newsQuery = useQuery({
    queryKey: queryKeys.news.admin({ search, status }),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      return apiGetRaw<Paginated<NewsArticle>>(`/news?${params.toString()}`);
    },
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.news.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.news.public });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<NewsArticle>('/news', payload),
    onSuccess: () => {
      toast.success('Article créé.');
      setFormTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<NewsArticle>(`/news/${id}`, payload),
    onSuccess: () => {
      toast.success('Article mis à jour.');
      setFormTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/news/${id}`),
    onSuccess: () => {
      toast.success('Article supprimé.');
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const articles = useMemo(() => newsQuery.data?.data ?? [], [newsQuery.data]);
  const published = articles.filter((article) => article.status === 'PUBLISHED').length;
  const drafts = articles.length - published;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Actualités"
        subtitle="Rédigez et publiez les articles santé visibles sur le site public et l'accueil."
        actions={
          <Can permission="news:create">
            <Button size="sm" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouvel article
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Articles" value={articles.length} icon={Newspaper} tone="info" />
        <StatCard label="Publiés" value={published} icon={Newspaper} tone="success" />
        <StatCard label="Brouillons" value={drafts} icon={FilePlus2} tone={drafts > 0 ? 'warning' : 'brand'} />
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_200px]">
        <Input
          placeholder="Rechercher un article, une catégorie…"
          leftIcon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Rechercher un article"
        />
        <Select
          placeholder="Tous les statuts"
          options={[
            { value: 'PUBLISHED', label: 'Publiés' },
            { value: 'DRAFT', label: 'Brouillons' },
          ]}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filtrer par statut"
        />
      </Card>

      {newsQuery.isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      ) : newsQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(newsQuery.error)}
            onRetry={() => void newsQuery.refetch()}
          />
        </Card>
      ) : articles.length === 0 ? (
        <Card>
          <EmptyState
            icon={Newspaper}
            title="Aucun article"
            description={search || status ? 'Aucun article ne correspond à votre recherche.' : 'Rédigez votre premier article pour alimenter la rubrique Actualités.'}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Card key={article.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={article.status === 'PUBLISHED' ? 'success' : 'warning'}>
                    {STATUS_LABELS[article.status]}
                  </Badge>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                    {article.category}
                  </p>
                  <h2 className="mt-1 line-clamp-2 font-semibold text-slate-900 dark:text-white">
                    {article.title}
                  </h2>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Can permission="news:update">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Modifier ${article.title}`}
                      onClick={() => setFormTarget(article)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Can>
                  <Can permission="news:delete">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                      aria-label={`Supprimer ${article.title}`}
                      onClick={() => setDeleteTarget(article)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Can>
                </div>
              </div>

              <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600 dark:text-slate-300">
                {article.excerpt}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>{article.published_at ? formatDate(article.published_at) : 'Non publié'}</span>
                <span>{article.read_time} min de lecture</span>
                {article.status === 'PUBLISHED' && (
                  <a href={`/actualites/${article.slug}`} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                    Voir <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewsFormModal
        isOpen={formTarget !== null}
        article={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => setFormTarget(null)}
        onSubmit={(payload) => {
          if (formTarget !== null && formTarget !== 'new') {
            updateMutation.mutate({ id: formTarget.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer cet article ?"
        message={
          <>
            L’article <span className="font-semibold">{deleteTarget?.title}</span> sera définitivement
            supprimé du site public.
          </>
        }
        confirmLabel="Supprimer"
        isLoading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaire                                                                  */
/* -------------------------------------------------------------------------- */

interface FormValues {
  title: string;
  category: string;
  excerpt: string;
  content: string;
  keyPoints: string;
  author: string;
  readTime: string;
  imageUrl: string;
  status: NewsStatus;
  publishedAt: string;
}

const EMPTY_VALUES: FormValues = {
  title: '',
  category: '',
  excerpt: '',
  content: '',
  keyPoints: '',
  author: 'Équipe MediClinic',
  readTime: '',
  imageUrl: '',
  status: 'DRAFT',
  publishedAt: '',
};

function NewsFormModal({
  isOpen,
  article,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  article?: NewsArticle;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      title: article?.title ?? '',
      category: article?.category ?? '',
      excerpt: article?.excerpt ?? '',
      content: article?.content.join('\n\n') ?? '',
      keyPoints: article?.key_points.join('\n') ?? '',
      author: article?.author ?? 'Équipe MediClinic',
      readTime: article?.read_time ? String(article.read_time) : '',
      imageUrl: article?.image_url ?? '',
      status: article?.status ?? 'DRAFT',
      publishedAt: toLocalInput(article?.published_at ?? null),
    });
  }, [isOpen, article]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (): void => {
    if (values.title.trim().length < 3) {
      toast.error('Le titre doit contenir au moins 3 caractères.');
      return;
    }
    if (values.category.trim().length < 2) {
      toast.error('Indiquez une catégorie.');
      return;
    }
    if (values.excerpt.trim().length < 10) {
      toast.error('Le résumé doit contenir au moins 10 caractères.');
      return;
    }
    const paragraphs = values.content
      .split(/\n\s*\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      toast.error('Ajoutez au moins un paragraphe.');
      return;
    }
    const keyPoints = values.keyPoints
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    onSubmit({
      title: values.title.trim(),
      category: values.category.trim(),
      excerpt: values.excerpt.trim(),
      content: paragraphs,
      keyPoints,
      author: values.author.trim() || 'Équipe MediClinic',
      ...(values.readTime ? { readTime: Number(values.readTime) } : {}),
      ...(values.imageUrl.trim() ? { imageUrl: values.imageUrl.trim() } : {}),
      status: values.status,
      ...(values.publishedAt ? { publishedAt: new Date(values.publishedAt).toISOString() } : {}),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={article ? 'Modifier l’article' : 'Nouvel article'}
      description="Les paragraphes sont séparés par une ligne vide ; les points clés, par un retour à la ligne."
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {article ? 'Enregistrer' : 'Créer l’article'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Titre" required value={values.title} onChange={(event) => set('title', event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Catégorie" required value={values.category} onChange={(event) => set('category', event.target.value)} />
          <Input label="Auteur" value={values.author} onChange={(event) => set('author', event.target.value)} />
        </div>
        <Textarea label="Résumé" rows={2} required value={values.excerpt} onChange={(event) => set('excerpt', event.target.value)} />
        <Textarea label="Contenu" rows={7} required value={values.content} onChange={(event) => set('content', event.target.value)} />
        <Textarea label="Points clés (un par ligne)" rows={4} value={values.keyPoints} onChange={(event) => set('keyPoints', event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Statut"
            options={[
              { value: 'DRAFT', label: 'Brouillon' },
              { value: 'PUBLISHED', label: 'Publié' },
            ]}
            value={values.status}
            onChange={(event) => set('status', event.target.value as NewsStatus)}
          />
          <Input
            label="Temps de lecture (min)"
            type="number"
            min={1}
            max={60}
            value={values.readTime}
            onChange={(event) => set('readTime', event.target.value)}
          />
          <Input
            label="Date de publication"
            type="datetime-local"
            value={values.publishedAt}
            onChange={(event) => set('publishedAt', event.target.value)}
          />
        </div>
        <Input
          label="URL de l’illustration (facultatif)"
          type="url"
          value={values.imageUrl}
          onChange={(event) => set('imageUrl', event.target.value)}
          placeholder="https://…"
        />
      </div>
    </Modal>
  );
}

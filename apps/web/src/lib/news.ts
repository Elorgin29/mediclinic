/**
 * Pont entre l'API « Actualités » et le contenu éditorial du site public.
 *
 * Les composants publics continuent de consommer le type `Article` historique.
 * Tant que l'API ne répond pas (ou si elle est indisponible), on retombe sur
 * les articles statiques : le site vitrine reste toujours affichable.
 */

import type { NewsArticle } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '@/i18n/I18nContext';
import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

type Translator = (key: string, fallback?: string) => string;

import { ARTICLES, type Article } from './articles';

/** Convertit un article API dans le format attendu par les pages publiques. */
export function toPublicArticle(article: NewsArticle, t?: Translator): Article {
  const translate: Translator = t ?? ((_key, fallback) => fallback ?? _key);
  return {
    slug: article.slug,
    title: translate(`news.${article.slug}.title`, article.title),
    category: article.category,
    date: (article.published_at ?? article.created_at).slice(0, 10),
    readTime: article.read_time,
    author: article.author,
    excerpt: translate(`news.${article.slug}.excerpt`, article.excerpt),
    content: article.content,
    keyPoints: article.key_points,
  };
}

/** Articles publiés, avec repli sur le contenu statique. */
export function usePublicArticles(limit = 50) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: [...queryKeys.news.public, limit] as const,
    queryFn: () => apiGet<NewsArticle[]>(`/news/public?limit=${limit}`),
    staleTime: 60_000,
  });

  const articles: Article[] =
    query.data && query.data.length > 0 ? query.data.map((item) => toPublicArticle(item, t)) : ARTICLES;

  return { articles, isLoading: query.isLoading };
}

/** Un article publié par son slug, avec repli sur le contenu statique. */
export function usePublicArticle(slug: string | undefined) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: queryKeys.news.detail(slug ?? ''),
    queryFn: () => apiGet<NewsArticle>(`/news/public/${slug}`),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  const article: Article | undefined = query.data
    ? toPublicArticle(query.data, t)
    : ARTICLES.find((item) => item.slug === slug);

  return { article, isLoading: query.isLoading };
}

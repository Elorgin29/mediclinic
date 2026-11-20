/**
 * Pont entre l'API « Actualités » et le contenu éditorial du site public.
 *
 * Les composants publics continuent de consommer le type `Article` historique.
 * Tant que l'API ne répond pas (ou si elle est indisponible), on retombe sur
 * les articles statiques : le site vitrine reste toujours affichable.
 */

import type { NewsArticle } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

import { ARTICLES, type Article } from './articles';

/** Convertit un article API dans le format attendu par les pages publiques. */
export function toPublicArticle(article: NewsArticle): Article {
  return {
    slug: article.slug,
    title: article.title,
    category: article.category,
    date: (article.published_at ?? article.created_at).slice(0, 10),
    readTime: article.read_time,
    author: article.author,
    excerpt: article.excerpt,
    content: article.content,
    keyPoints: article.key_points,
  };
}

/** Articles publiés, avec repli sur le contenu statique. */
export function usePublicArticles(limit = 50) {
  const query = useQuery({
    queryKey: [...queryKeys.news.public, limit] as const,
    queryFn: () => apiGet<NewsArticle[]>(`/news/public?limit=${limit}`),
    staleTime: 60_000,
  });

  const articles: Article[] =
    query.data && query.data.length > 0 ? query.data.map(toPublicArticle) : ARTICLES;

  return { articles, isLoading: query.isLoading };
}

/** Un article publié par son slug, avec repli sur le contenu statique. */
export function usePublicArticle(slug: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.news.detail(slug ?? ''),
    queryFn: () => apiGet<NewsArticle>(`/news/public/${slug}`),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  const article: Article | undefined = query.data
    ? toPublicArticle(query.data)
    : ARTICLES.find((item) => item.slug === slug);

  return { article, isLoading: query.isLoading };
}

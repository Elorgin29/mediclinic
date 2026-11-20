/**
 * Règles métier des actualités du site public.
 *
 * - le slug est généré depuis le titre et reste unique ;
 * - les paragraphes sont sérialisés en JSON dans la base ;
 * - la date de publication est renseignée automatiquement au passage en
 *   `PUBLISHED`, et remise à `null` au retour en brouillon ;
 * - seuls les articles publiés sont exposés par les routes publiques.
 */

import type { NewsArticle, NewsStatus } from '@mediclinic/shared';
import { z } from 'zod';

import {
  createNewsSchema,
  updateNewsSchema,
} from '@mediclinic/shared';
import { AppError } from '../../utils/app-error.js';
import { paginated, type Pagination } from '../../utils/pagination.js';
import * as repository from './news.repository.js';
import type { NewsRow } from './news.repository.js';

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

/** Transforme un titre en slug lisible, sans accent ni caractère spécial. */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  return slug.length > 0 ? slug : 'article';
}

/** Resolution d'un slug libre (ajout d'un suffixe numérique si nécessaire). */
async function uniqueSlug(title: string, excludeId?: number): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;

  while ((await repository.findIdBySlug(candidate, excludeId)) !== null) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Décode un tableau JSON, en tolérant les anciennes valeurs texte. */
function parseList(value: string | null): string[] {
  if (value === null || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // Valeur historique : on la restitue comme paragraphe unique.
  }
  return [value];
}

/** Convertit une ligne SQL en article exposé par l'API. */
export function toNews(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    excerpt: row.excerpt,
    content: parseList(row.content),
    key_points: parseList(row.key_points),
    author: row.author,
    read_time: Number(row.read_time),
    image_url: row.image_url,
    status: row.status,
    published_at: row.published_at === null ? null : String(row.published_at),
    created_by: row.created_by,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Convertit une date ISO en DATETIME MySQL (`AAAA-MM-JJ HH:mm:ss`). */
function toMySqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 19);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

/** Estime un temps de lecture (≈ 200 mots / minute), borné entre 1 et 60 min. */
function estimateReadTime(content: string[]): number {
  const words = content.join(' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(60, Math.max(1, Math.round(words / 200)));
}

/** Liste paginée d'administration. */
export async function list(filters: repository.NewsFilters, pagination: Pagination) {
  const { rows, total } = await repository.findAll(filters, pagination);
  return paginated(rows.map(toNews), total, pagination);
}

/** Articles publiés pour le site public. */
export async function listPublished(limit: number): Promise<NewsArticle[]> {
  const rows = await repository.findPublished(limit);
  return rows.map(toNews);
}

/** Article publié par son slug pour la page de détail publique. */
export async function getPublishedBySlug(slug: string): Promise<NewsArticle> {
  const row = await repository.findPublishedBySlug(slug);
  if (!row) throw AppError.notFound('Cet article est introuvable.', 'NEWS_NOT_FOUND');
  return toNews(row);
}

/** Article par identifiant (administration). */
export async function getById(id: number): Promise<NewsArticle> {
  const row = await repository.findById(id);
  if (!row) throw AppError.notFound('Cet article est introuvable.', 'NEWS_NOT_FOUND');
  return toNews(row);
}

/** Crée un article. */
export async function create(input: CreateNewsInput, userId: number): Promise<NewsArticle> {
  const status: NewsStatus = input.status;
  const publishedAt =
    status === 'PUBLISHED' ? (input.publishedAt ?? new Date().toISOString()) : null;

  const id = await repository.create({
    slug: await uniqueSlug(input.title),
    title: input.title,
    category: input.category,
    excerpt: input.excerpt,
    content: JSON.stringify(input.content),
    key_points: JSON.stringify(input.keyPoints ?? []),
    author: input.author,
    read_time: input.readTime ?? estimateReadTime(input.content),
    image_url: input.imageUrl ?? null,
    status,
    published_at: publishedAt === null ? null : toMySqlDateTime(publishedAt),
    created_by: userId,
  });

  return getById(id);
}

/** Met à jour un article et renvoie l'état avant/après pour l'audit. */
export async function update(
  id: number,
  input: UpdateNewsInput,
): Promise<{ before: NewsArticle; after: NewsArticle }> {
  const before = await getById(id);
  const changes: repository.NewsChanges = {};

  if (input.title !== undefined) {
    changes.title = input.title;
    changes.slug = await uniqueSlug(input.title, id);
  }
  if (input.category !== undefined) changes.category = input.category;
  if (input.excerpt !== undefined) changes.excerpt = input.excerpt;
  if (input.content !== undefined) {
    changes.content = JSON.stringify(input.content);
    if (input.readTime === undefined) changes.read_time = estimateReadTime(input.content);
  }
  if (input.keyPoints !== undefined) changes.key_points = JSON.stringify(input.keyPoints);
  if (input.author !== undefined) changes.author = input.author;
  if (input.readTime !== undefined) changes.read_time = input.readTime;
  if (input.imageUrl !== undefined) changes.image_url = input.imageUrl;

  if (input.status !== undefined) {
    changes.status = input.status;
    if (input.status === 'PUBLISHED') {
      changes.published_at = toMySqlDateTime(
        input.publishedAt ?? before.published_at ?? new Date().toISOString(),
      );
    } else {
      changes.published_at = null;
    }
  } else if (input.publishedAt !== undefined) {
    changes.published_at = input.publishedAt === null ? null : toMySqlDateTime(input.publishedAt);
  }

  if (Object.keys(changes).length > 0) await repository.update(id, changes);
  return { before, after: await getById(id) };
}

/** Supprime un article. */
export async function remove(id: number): Promise<NewsArticle> {
  const article = await getById(id);
  await repository.remove(id);
  return article;
}

/**
 * Accès aux données des actualités du site public.
 *
 * Toutes les requêtes sont préparées (`?`) ; le tri passe par une liste blanche.
 * `content` et `key_points` sont stockés en JSON dans la base et convertis en
 * tableaux par le service.
 */

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/** Ligne SQL brute d'un article. */
export interface NewsRow extends Row {
  id: number;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  key_points: string | null;
  author: string;
  read_time: number;
  image_url: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  published_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

const NEWS_COLUMNS = `
  n.id, n.slug, n.title, n.category, n.excerpt, n.content, n.key_points,
  n.author, n.read_time, n.image_url, n.status, n.published_at,
  n.created_by, n.created_at, n.updated_at
`;

/** Tri autorisé pour la liste d'administration. */
const NEWS_SORTABLE: Readonly<Record<string, string>> = {
  title: 'n.title',
  category: 'n.category',
  status: 'n.status',
  published_at: 'n.published_at',
  created_at: 'n.created_at',
  updated_at: 'n.updated_at',
};

export interface NewsFilters {
  status?: string;
  category?: string;
  search?: string;
  sort?: string;
  order?: string;
}

/** Construit les fragments WHERE partagés entre liste et comptage. */
function buildFilters(filters: NewsFilters): { fragments: string[]; values: unknown[] } {
  const fragments: string[] = [];
  const values: unknown[] = [];

  if (filters.status !== undefined) {
    fragments.push('n.status = ?');
    values.push(filters.status);
  }
  if (filters.category !== undefined && filters.category.length > 0) {
    fragments.push('n.category = ?');
    values.push(filters.category);
  }
  if (filters.search !== undefined && filters.search.length > 0) {
    const pattern = likePattern(filters.search);
    fragments.push('(n.title LIKE ? OR n.excerpt LIKE ? OR n.category LIKE ?)');
    values.push(pattern, pattern, pattern);
  }

  return { fragments, values };
}

/** Liste paginée d'administration (brouillons inclus). */
export async function findAll(
  filters: NewsFilters,
  pagination: { limit: number; offset: number },
): Promise<{ rows: NewsRow[]; total: number }> {
  const { fragments, values } = buildFilters(filters);
  const orderBy = buildOrderBy(filters.sort, filters.order, NEWS_SORTABLE, 'n.published_at', 'desc');

  const [rows, countRow] = await Promise.all([
    query<NewsRow>(
      `SELECT ${NEWS_COLUMNS}
         FROM news n
         ${whereClause(fragments)}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [...values, pagination.limit, pagination.offset],
    ),
    queryOne<Row & { total: number }>(
      `SELECT COUNT(*) AS total FROM news n ${whereClause(fragments)}`,
      values,
    ),
  ]);

  return { rows, total: Number(countRow?.total ?? 0) };
}

/** Articles publiés, du plus récent au plus ancien. */
export async function findPublished(limit: number): Promise<NewsRow[]> {
  return query<NewsRow>(
    `SELECT ${NEWS_COLUMNS}
       FROM news n
      WHERE n.status = 'PUBLISHED' AND n.published_at IS NOT NULL
      ORDER BY n.published_at DESC
      LIMIT ?`,
    [limit],
  );
}

/** Article publié par son slug (route publique). */
export async function findPublishedBySlug(slug: string): Promise<NewsRow | null> {
  return queryOne<NewsRow>(
    `SELECT ${NEWS_COLUMNS}
       FROM news n
      WHERE n.slug = ? AND n.status = 'PUBLISHED' AND n.published_at IS NOT NULL
      LIMIT 1`,
    [slug],
  );
}

/** Article par identifiant ( administration). */
export async function findById(id: number): Promise<NewsRow | null> {
  return queryOne<NewsRow>(`SELECT ${NEWS_COLUMNS} FROM news n WHERE n.id = ?`, [id]);
}

/** Identifiant portant déjà ce slug, éventuellement en excluant un article. */
export async function findIdBySlug(slug: string, excludeId?: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    `SELECT id FROM news WHERE slug = ?${excludeId === undefined ? '' : ' AND id <> ?'}`,
    excludeId === undefined ? [slug] : [slug, excludeId],
  );
  return row?.id ?? null;
}

export interface CreateNewsRow {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  key_points: string;
  author: string;
  read_time: number;
  image_url: string | null;
  status: string;
  published_at: string | null;
  created_by: number | null;
}

/** Crée un article. */
export async function create(input: CreateNewsRow): Promise<number> {
  return insert(
    `INSERT INTO news
       (slug, title, category, excerpt, content, key_points, author,
        read_time, image_url, status, published_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.slug,
      input.title,
      input.category,
      input.excerpt,
      input.content,
      input.key_points,
      input.author,
      input.read_time,
      input.image_url,
      input.status,
      input.published_at,
      input.created_by,
    ],
  );
}

/** Champs modifiables d'un article (camelCase exposé au service). */
export interface NewsChanges {
  slug?: string;
  title?: string;
  category?: string;
  excerpt?: string;
  content?: string;
  key_points?: string;
  author?: string;
  read_time?: number;
  image_url?: string | null;
  status?: string;
  published_at?: string | null;
}

const NEWS_UPDATABLE: readonly string[] = [
  'slug', 'title', 'category', 'excerpt', 'content', 'key_points',
  'author', 'read_time', 'image_url', 'status', 'published_at',
];

/** Met à jour partiellement un article. */
export async function update(id: number, changes: NewsChanges): Promise<void> {
  const values: Record<string, unknown> = {};
  for (const key of NEWS_UPDATABLE) {
    if (changes[key as keyof NewsChanges] !== undefined) values[key] = changes[key as keyof NewsChanges];
  }
  const { sql, params } = buildSetClause(values, NEWS_UPDATABLE);
  await execute(`UPDATE news SET ${sql} WHERE id = ?`, [...params, id]);
}

/** Supprime physiquement un article. */
export async function remove(id: number): Promise<void> {
  await execute('DELETE FROM news WHERE id = ?', [id]);
}

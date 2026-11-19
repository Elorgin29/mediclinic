/**
 * Pagination, tri et recherche.
 *
 * Le tri est validé par une **liste blanche** : la valeur reçue du client est
 * une clé (ex. `scheduled_at`) traduite en expression SQL connue. Aucune
 * donnée utilisateur n'est donc injectée directement dans la requête.
 */

import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  type Paginated,
} from '@mediclinic/shared';

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/** Lit `page` et `limit` depuis la query string, avec des bornes sûres. */
export function parsePagination(query: { page?: unknown; limit?: unknown }): Pagination {
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10);
  const rawLimit = Number.parseInt(String(query.limit ?? PAGINATION_DEFAULT_LIMIT), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), PAGINATION_MAX_LIMIT)
    : PAGINATION_DEFAULT_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

/** Enveloppe une page de résultats dans le format attendu par le front. */
export function paginated<T>(data: T[], total: number, pagination: Pagination): Paginated<T> {
  return {
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
    },
  };
}

/**
 * Construit la clause `ORDER BY`.
 *
 * @param sort       clé demandée par le client (ex. `last_name`)
 * @param order      `asc` ou `desc`
 * @param allowed    liste blanche `clé → expression SQL`
 * @param fallback   expression utilisée si la clé est absente ou inconnue
 * @param defaultDir direction par défaut lorsqu'aucune n'est demandée
 */
export function buildOrderBy(
  sort: string | undefined,
  order: string | undefined,
  allowed: Readonly<Record<string, string>>,
  fallback: string,
  defaultDir: 'asc' | 'desc' = 'desc',
): string {
  const expression = sort !== undefined ? allowed[sort] : undefined;
  const direction = order?.toLowerCase() === 'asc' ? 'ASC' : order?.toLowerCase() === 'desc' ? 'DESC' : null;

  return `${expression ?? fallback} ${direction ?? defaultDir.toUpperCase()}`;
}

/** Échappe les caractères spéciaux d'un motif `LIKE` et l'entoure de `%`. */
export function likePattern(search: string): string {
  const escaped = search.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/** Construit une clause `WHERE … AND …` à partir de fragments non vides. */
export function whereClause(fragments: readonly string[]): string {
  const kept = fragments.filter((fragment) => fragment.trim().length > 0);
  return kept.length === 0 ? '' : `WHERE ${kept.join(' AND ')}`;
}

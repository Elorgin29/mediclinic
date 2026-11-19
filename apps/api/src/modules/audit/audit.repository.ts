/**
 * Accès aux données du journal d'audit (`/api/audit`).
 *
 * `audit_logs` est une table en ajout seul : ce repository ne contient donc
 * aucune mise à jour ni suppression, uniquement des lectures et l'insertion
 * d'une entrée rédigée côté client.
 *
 * Les colonnes `old_value` / `new_value` sont de type JSON : le pilote peut les
 * renvoyer sous forme d'objet ou de chaîne selon la version du serveur. La
 * désérialisation est assurée par `parseJsonColumn` dans le service — jamais
 * ici — afin que le repository reste strictement du SQL.
 */

import type { Row } from '../../config/db.js';
import { limitClause, query, queryOne } from '../../config/db.js';
import { buildOrderBy, whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Types de lignes                                                             */
/* -------------------------------------------------------------------------- */

/** Ligne de `audit_logs` jointe à son auteur. */
export interface AuditLogRow extends Row {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Agrégat `libellé / total` (par action, ressource ou utilisateur). */
export interface AuditCountRow extends Row {
  label: string | null;
  total: number | string | null;
}

/** Agrégat `jour / total` (série chronologique). */
export interface AuditDayRow extends Row {
  day: string;
  total: number | string | null;
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuditFilters {
  userId?: number;
  resource?: string;
  action?: string;
  /** `AAAA-MM-JJ` (borne basse incluse). */
  from?: string;
  /** `AAAA-MM-JJ` (borne haute incluse). */
  to?: string;
  search?: string;
  resourceId?: string;
}

/**
 * Colonnes de tri autorisées (liste blanche).
 * La clé reçue du client est traduite en expression SQL connue : aucune valeur
 * utilisateur n'atteint la requête.
 */
const AUDIT_SORT_COLUMNS: Readonly<Record<string, string>> = {
  created_at: 'al.created_at',
  action: 'al.action',
  resource: 'al.resource',
  user_name: 'user_name',
};

/** Colonnes exposées, dans l'ordre des lectures. */
const AUDIT_SELECT = `
  SELECT
    al.id,
    al.user_id,
    CONCAT(u.first_name, ' ', u.last_name) AS user_name,
    al.action,
    al.resource,
    al.resource_id,
    al.old_value,
    al.new_value,
    al.ip_address,
    al.user_agent,
    al.created_at
  FROM audit_logs al
  LEFT JOIN users u ON u.id = al.user_id
`;

/**
 * Construit la clause WHERE commune à la liste et au comptage.
 * La borne haute est incluse en « jour entier » : une action de 23 h 59 le
 * dernier jour de la plage doit rester visible.
 */
function buildFilters(filters: AuditFilters): { where: string; params: unknown[] } {
  const fragments: string[] = [];
  const params: unknown[] = [];

  if (filters.userId !== undefined) {
    fragments.push('al.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.resource !== undefined) {
    fragments.push('al.resource = ?');
    params.push(filters.resource);
  }
  if (filters.action !== undefined) {
    fragments.push('al.action = ?');
    params.push(filters.action);
  }
  if (filters.resourceId !== undefined) {
    fragments.push('al.resource_id = ?');
    params.push(filters.resourceId);
  }
  if (filters.from !== undefined) {
    fragments.push('al.created_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to !== undefined) {
    fragments.push('al.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.to);
  }
  if (filters.search !== undefined) {
    // La recherche porte sur l'action, la ressource et l'auteur : ce sont les
    // trois axes de lecture du journal dans l'interface.
    fragments.push(
      `(al.action LIKE ? OR al.resource LIKE ? OR al.resource_id LIKE ?
        OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?)`,
    );
    const pattern = `%${filters.search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  return { where: whereClause(fragments), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Nombre total d'entrées correspondant aux filtres. */
export async function countAuditLogs(filters: AuditFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOne<Row & { total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/**
 * Liste paginée du journal, triée par date décroissante.
 * `buildOrderBy` n'autorise que la liste blanche ; l'identifiant départage les
 * entrées de même seconde pour garantir une pagination stable.
 */
export async function listAuditLogs(
  filters: AuditFilters,
  options: { sort?: string; order?: string; limit: number; offset: number },
): Promise<AuditLogRow[]> {
  const { where, params } = buildFilters(filters);
  const orderBy = buildOrderBy(
    options.sort,
    options.order,
    AUDIT_SORT_COLUMNS,
    'al.created_at',
    'desc',
  );
  const limit = limitClause(options.limit, options.offset);

  return query<AuditLogRow>(
    `${AUDIT_SELECT} ${where} ORDER BY ${orderBy}, al.id DESC ${limit.sql}`,
    [...params, ...limit.params],
  );
}

/** Une entrée du journal, auteur joint. */
export async function findAuditLogById(id: number): Promise<AuditLogRow | null> {
  return queryOne<AuditLogRow>(`${AUDIT_SELECT} WHERE al.id = ?`, [id]);
}

/**
 * Dernier identifiant écrit par un utilisateur.
 * Sert à retrouver l'entrée créée par `writeAuditLog`, qui ne renvoie pas
 * l'identifiant inséré : on compare la valeur avant et après l'écriture.
 */
export async function findLatestIdForUser(userId: number): Promise<number> {
  const row = await queryOne<Row & { id: number | null }>(
    'SELECT MAX(id) AS id FROM audit_logs WHERE user_id = ?',
    [userId],
  );
  return Number(row?.id ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Statistiques                                                                */
/* -------------------------------------------------------------------------- */

/** Nombre total d'entrées (sans filtre, ou sur une période si fournie). */
export async function countAll(filters: AuditFilters = {}): Promise<number> {
  return countAuditLogs(filters);
}

/** Répartition des entrées par action. */
export async function countByAction(filters: AuditFilters = {}): Promise<AuditCountRow[]> {
  const { where, params } = buildFilters(filters);
  return query<AuditCountRow>(
    `SELECT al.action AS label, COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     GROUP BY al.action
     ORDER BY total DESC, label ASC`,
    params,
  );
}

/** Répartition des entrées par ressource. */
export async function countByResource(filters: AuditFilters = {}): Promise<AuditCountRow[]> {
  const { where, params } = buildFilters(filters);
  return query<AuditCountRow>(
    `SELECT al.resource AS label, COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     GROUP BY al.resource
     ORDER BY total DESC, label ASC`,
    params,
  );
}

/** Répartition des entrées par utilisateur (les comptes supprimés sont regroupés). */
export async function countByUser(
  filters: AuditFilters = {},
  limit = 20,
): Promise<AuditCountRow[]> {
  const { where, params } = buildFilters(filters);
  return query<AuditCountRow>(
    `SELECT
       COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Compte supprimé') AS label,
       COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     GROUP BY label
     ORDER BY total DESC, label ASC
     LIMIT ?`,
    [...params, limit],
  );
}

/** Activité des dernières 24 heures. */
export async function countLast24h(): Promise<number> {
  const row = await queryOne<Row & { total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  return Number(row?.total ?? 0);
}

/** Série quotidienne des entrées (uniquement les jours ayant de l'activité). */
export async function countByDay(filters: AuditFilters = {}): Promise<AuditDayRow[]> {
  const { where, params } = buildFilters(filters);
  return query<AuditDayRow>(
    `SELECT DATE(al.created_at) AS day, COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     GROUP BY day
     ORDER BY day ASC`,
    params,
  );
}

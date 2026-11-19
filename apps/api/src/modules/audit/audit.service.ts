/**
 * Règles métier du journal d'audit (`/api/audit`).
 *
 * Deux invariants :
 *  1. **Le journal est en lecture seule côté client.** Seule la route
 *     `POST /` permet d'ajouter une entrée, et elle passe par le même
 *     `writeAuditLog()` que le reste de l'application : aucun contournement de
 *     la sérialisation JSON ni des colonnes techniques.
 *  2. **Les filtres `resource` et `action` sont validés** contre
 *     `PERMISSION_RESOURCES` et `AUDIT_ACTIONS` de `@mediclinic/shared`. Une
 *     valeur inconnue produirait sinon une liste vide silencieuse, ce qui
 *     laisserait croire à une absence d'activité.
 */

import type { AuditLog } from '@mediclinic/shared';
import { AUDIT_ACTIONS, PERMISSION_RESOURCES } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { parseJsonColumn } from '../../utils/http.js';
import { writeAuditLog } from '../../utils/audit-logger.js';
import type { RequestContext } from '../../types/auth.js';
import type { Pagination } from '../../utils/pagination.js';
import * as repository from './audit.repository.js';
import type { AuditCountRow, AuditLogRow } from './audit.repository.js';

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convertit une ligne SQL en `AuditLog` partagé.
 * Les colonnes JSON sont normalisées ici : MySQL peut renvoyer un objet ou une
 * chaîne selon la configuration du serveur, le front doit toujours recevoir un
 * objet (ou `null`).
 */
export function toAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: Number(row.id),
    user_id: row.user_id === null ? null : Number(row.user_id),
    user_name: row.user_name ?? null,
    action: row.action,
    resource: row.resource,
    resource_id: row.resource_id === null ? null : String(row.resource_id),
    old_value: parseJsonColumn<Record<string, unknown>>(row.old_value),
    new_value: parseJsonColumn<Record<string, unknown>>(row.new_value),
    ip_address: row.ip_address ?? null,
    user_agent: row.user_agent ?? null,
    created_at: String(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuditListFilters {
  userId?: number;
  resource?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
  resourceId?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Valide `resource` contre la liste des ressources connues.
 * @throws AppError 400 `INVALID_RESOURCE`
 */
export function assertValidResource(resource: string | undefined): void {
  if (resource === undefined) return;
  if (!(PERMISSION_RESOURCES as readonly string[]).includes(resource)) {
    throw AppError.badRequest(
      `Ressource inconnue « ${resource} ». Valeurs acceptées : ${PERMISSION_RESOURCES.join(', ')}.`,
      'INVALID_RESOURCE',
      { field: 'resource', allowed: [...PERMISSION_RESOURCES] },
    );
  }
}

/**
 * Valide `action` contre la liste des actions journalisables.
 * @throws AppError 400 `INVALID_ACTION`
 */
export function assertValidAction(action: string | undefined): void {
  if (action === undefined) return;
  if (!(AUDIT_ACTIONS as readonly string[]).includes(action)) {
    throw AppError.badRequest(
      `Action inconnue « ${action} ». Valeurs acceptées : ${AUDIT_ACTIONS.join(', ')}.`,
      'INVALID_ACTION',
      { field: 'action', allowed: [...AUDIT_ACTIONS] },
    );
  }
}

/** Valide les deux filtres énumérés d'un coup. */
export function assertValidFilters(filters: AuditListFilters): void {
  assertValidResource(filters.resource);
  assertValidAction(filters.action);
}

/** Normalise les filtres (suppression des `undefined`, validation incluse). */
function normalize(filters: AuditListFilters): repository.AuditFilters {
  assertValidFilters(filters);

  return {
    ...(filters.userId === undefined ? {} : { userId: filters.userId }),
    ...(filters.resource === undefined ? {} : { resource: filters.resource }),
    ...(filters.action === undefined ? {} : { action: filters.action }),
    ...(filters.resourceId === undefined ? {} : { resourceId: filters.resourceId }),
    ...(filters.from === undefined ? {} : { from: filters.from }),
    ...(filters.to === undefined ? {} : { to: filters.to }),
    ...(filters.search === undefined ? {} : { search: filters.search }),
  };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée du journal, tri par date décroissante par défaut. */
export async function list(
  filters: AuditListFilters,
  pagination: Pagination,
): Promise<{ data: AuditLog[]; total: number }> {
  const normalized = normalize(filters);

  const [rows, total] = await Promise.all([
    repository.listAuditLogs(normalized, {
      ...(filters.sort === undefined ? {} : { sort: filters.sort }),
      ...(filters.order === undefined ? {} : { order: filters.order }),
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countAuditLogs(normalized),
  ]);

  return { data: rows.map(toAuditLog), total };
}

/** Une entrée précise du journal. */
export async function getById(id: number): Promise<AuditLog> {
  const row = await repository.findAuditLogById(id);
  if (!row) {
    throw AppError.notFound('Entrée d’audit introuvable.', 'AUDIT_LOG_NOT_FOUND');
  }
  return toAuditLog(row);
}

/* -------------------------------------------------------------------------- */
/* Statistiques                                                                */
/* -------------------------------------------------------------------------- */

export interface AuditCountPoint {
  label: string;
  count: number;
}

export interface AuditStats {
  total: number;
  byAction: AuditCountPoint[];
  byResource: AuditCountPoint[];
  byUser: AuditCountPoint[];
  last24h: number;
}

/** Convertit un agrégat en point de statistique typé. */
function toCountPoint(row: AuditCountRow): AuditCountPoint {
  return {
    label: row.label ?? 'Non renseigné',
    // COUNT() arrive en chaîne : la conversion est systématique.
    count: Number(row.total ?? 0),
  };
}

/** Indicateurs du journal : totaux, répartitions et activité des 24 h. */
export async function getStats(): Promise<AuditStats> {
  const [total, byAction, byResource, byUser, last24h] = await Promise.all([
    repository.countAll(),
    repository.countByAction(),
    repository.countByResource(),
    repository.countByUser(),
    repository.countLast24h(),
  ]);

  return {
    total: Number(total),
    byAction: byAction.map(toCountPoint),
    byResource: byResource.map(toCountPoint),
    byUser: byUser.map(toCountPoint),
    last24h: Number(last24h),
  };
}

/* -------------------------------------------------------------------------- */
/* Écriture côté client                                                        */
/* -------------------------------------------------------------------------- */

export interface ClientAuditInput {
  action: string;
  resource: string;
  resourceId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Journalise une action signalée par le front (par exemple l'ouverture d'un
 * écran sensible). L'écriture est déléguée à `writeAuditLog`, qui ne lève
 * jamais : un journal indisponible ne doit pas casser l'interface.
 *
 * L'utilisateur et le contexte technique proviennent de la requête, jamais du
 * corps : un client ne peut donc pas falsifier l'auteur d'une entrée.
 */
export async function logClientAction(
  input: ClientAuditInput,
  userId: number,
  context: RequestContext,
): Promise<AuditLog> {
  assertValidResource(input.resource);
  assertValidAction(input.action);

  // `writeAuditLog` ne renvoie pas l'identifiant inséré : on borne la recherche
  // par la dernière entrée de l'utilisateur avant puis après l'écriture.
  const previousMaxId = await repository.findLatestIdForUser(userId);

  await writeAuditLog({
    userId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  const latestId = await repository.findLatestIdForUser(userId);
  if (latestId <= previousMaxId) {
    throw AppError.internal(
      'L’entrée d’audit n’a pas pu être écrite.',
      'AUDIT_LOG_WRITE_FAILED',
    );
  }

  const created = await repository.findAuditLogById(latestId);
  if (!created) {
    throw AppError.internal(
      'L’entrée d’audit n’a pas pu être relue après écriture.',
      'AUDIT_LOG_WRITE_FAILED',
    );
  }

  return toAuditLog(created);
}

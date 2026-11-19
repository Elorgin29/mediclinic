/**
 * Contrôleurs HTTP du journal d'audit (`/api/audit`).
 *
 * Aucune règle métier ici : la validation des filtres énumérés (`resource`,
 * `action`) et la désérialisation JSON sont assurées par le service.
 */

import { auditQuerySchema, AUDIT_ACTIONS, PERMISSION_RESOURCES } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import type { AuthUser } from '../../types/auth.js';import { requestContext } from '../../utils/audit-logger.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './audit.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Filtres de liste : `auditQuerySchema` couvre `userId`, `resource`, `action`,
 * `from`, `to` et la pagination. On y ajoute la recherche libre, l'identifiant
 * de ressource et le tri.
 *
 * `resource` et `action` restent des chaînes ici : le service les valide contre
 * les listes partagées et renvoie un 400 explicite (un `z.enum` produirait un
 * message de validation moins lisible pour ces deux champs).
 */
export const auditListQuerySchema = auditQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  resourceId: z.string().trim().max(40).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

/** Corps de `POST /api/audit` : une action signalée par le front. */
export const clientAuditSchema = z.object({
  action: z.enum(AUDIT_ACTIONS),
  resource: z.enum(PERMISSION_RESOURCES),
  resourceId: z.union([z.string(), z.number()]).nullable().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
});

/** Identifiant de route (`:id` entier positif). */
export const auditIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Query de liste déjà validée. */
interface AuditListQuery {
  page?: number;
  limit?: number;
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

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/audit
 * Liste paginée du journal, triée par date décroissante.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AuditListQuery;
  const pagination = parsePagination(req.query);

  const { data, total } = await service.list(
    {
      ...(query.userId === undefined ? {} : { userId: query.userId }),
      ...(query.resource === undefined ? {} : { resource: query.resource }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.order === undefined ? {} : { order: query.order }),
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/audit/stats
 * Totaux et répartitions — déclaré AVANT `/:id`.
 */
export const stats: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await service.getStats();
  res.json({ data });
});

/**
 * GET /api/audit/:id
 * Détail d'une entrée (valeurs avant/après désérialisées).
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const entry = await service.getById(id);

  res.json({ data: entry });
});

/**
 * POST /api/audit
 * Journalise une action signalée par le client. L'auteur est TOUJOURS
 * l'utilisateur authentifié, jamais une valeur du corps.
 *
 * Aucun middleware `auditTrail` n'est branché sur cette route : l'écriture est
 * déjà faite ici, un second passage créerait une entrée en double.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const body = clientAuditSchema.parse(req.body);

  const entry = await service.logClientAction(
    {
      action: body.action,
      resource: body.resource,
      resourceId: body.resourceId ?? null,
      oldValue: body.oldValue,
      newValue: body.newValue,
    },
    user.id,
    requestContext(req),
  );

  res.status(201).json({ data: entry });
});

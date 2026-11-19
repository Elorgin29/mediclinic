/**
 * Contrôleurs HTTP du module « spécialités ».
 *
 * Aucune règle métier et aucun SQL ici : lecture de la requête (déjà validée
 * par le middleware `validate`), appel au service, mise en forme de la réponse.
 */

import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import * as service from './specialties.service.js';

/** Lit une valeur de query string sous forme de texte. */
function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * GET /api/specialties
 * Liste complète des spécialités, avec le nombre de médecins et de rendez-vous.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.list({
    search: asText(req.query.search),
    sort: asText(req.query.sort),
    order: asText(req.query.order),
  });

  res.json({ data });
});

/**
 * GET /api/specialties/:id
 * Détail d'une spécialité.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getById(parseIdParam(req));
  res.json({ data });
});

/**
 * POST /api/specialties
 * Crée une spécialité (409 si le nom est déjà pris).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.create(req.body as service.CreateSpecialtyInput);
  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'specialty',
    resourceId: data.id,
    newValue: data,
  });

  res.status(201).json({ data });
});

/**
 * PATCH /api/specialties/:id
 * Met à jour partiellement une spécialité (404 si absente, 409 si le nom existe).
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const { before, after } = await service.update(id, req.body as service.UpdateSpecialtyInput);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'specialty',
    resourceId: id,
    oldValue: before,
    newValue: after,
  });

  res.json({ data: after });
});

/**
 * DELETE /api/specialties/:id
 * Supprime une spécialité sans médecin rattaché (409 sinon).
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const deleted = await service.remove(id);

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'specialty',
    resourceId: id,
    oldValue: deleted,
  });

  res.status(204).send();
});

/**
 * Contrôleurs HTTP du module « départements ».
 *
 * Aucune règle métier et aucun SQL ici : lecture de la requête (déjà validée
 * par le middleware `validate`), appel au service, mise en forme de la réponse.
 */

import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import * as service from './departments.service.js';

/** Lit une valeur de query string sous forme de texte. */
function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * GET /api/departments
 * Liste des départements avec le nom du chef et le nombre de médecins.
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
 * GET /api/departments/:id
 * Détail du département et liste de ses médecins.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getDetail(parseIdParam(req));
  res.json({ data });
});

/**
 * POST /api/departments
 * Crée un département (409 si le nom est pris, 422 si le chef est inconnu).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.create(req.body as service.CreateDepartmentInput);
  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'department',
    resourceId: data.id,
    newValue: data,
  });

  res.status(201).json({ data });
});

/**
 * PATCH /api/departments/:id
 * Met à jour un département, y compris son chef (`headDoctorId: null` pour le retirer).
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const { before, after } = await service.update(id, req.body as service.UpdateDepartmentInput);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'department',
    resourceId: id,
    oldValue: before,
    newValue: after,
  });

  res.json({ data: after });
});

/**
 * DELETE /api/departments/:id
 * Supprime un département sans médecin, rendez-vous ni garde rattaché (409 sinon).
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const deleted = await service.remove(id);

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'department',
    resourceId: id,
    oldValue: deleted,
  });

  res.status(204).send();
});

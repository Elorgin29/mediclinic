/**
 * Contrôleurs HTTP du module « médecins ».
 *
 * Aucune règle métier et aucun SQL ici : lecture de la requête, validation via
 * les schémas partagés `@mediclinic/shared`, appel au service et mise en forme
 * de la réponse (`{ data }`, enveloppe paginée ou 204).
 */

import {
  availabilityQuerySchema,
  createDoctorSchema,
  listQuerySchema,
  updateDoctorSchema,
} from '@mediclinic/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './doctors.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas locaux                                                              */
/* -------------------------------------------------------------------------- */

/** Booléen de query string strict : `z.coerce.boolean()` convertirait « false » en `true`. */
const queryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/**
 * Filtres de la liste interne : le schéma partagé est complété des filtres
 * propres à l'annuaire (spécialité, département, acceptation de patients).
 */
const doctorListQuerySchema = listQuerySchema.extend({
  specialtyId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  accepting: queryBooleanSchema.optional(),
});

/**
 * Annuaire public : `partial()` rend `page`, `limit` et `order` réellement
 * facultatifs, la liste ouverte n'étant pas paginée par défaut. `limit` reste
 * honoré s'il est fourni (vignettes de la page d'accueil).
 */
const publicDirectoryQuerySchema = listQuerySchema.partial().extend({
  specialtyId: z.coerce.number().int().positive().optional(),
});

/**
 * Composition locale : l'identifiant du médecin vient du chemin (`:id`), on
 * retire donc `doctorId` du schéma partagé pour éviter d'accepter un
 * identifiant contradictoire entre le chemin et la query string.
 */
const availabilityDateSchema = availabilityQuerySchema.omit({ doctorId: true });

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/doctors/public
 * Annuaire public : médecins actifs acceptant de nouveaux patients, sans jeton.
 */
export const listPublic: RequestHandler = asyncHandler(async (req, res) => {
  const query = publicDirectoryQuerySchema.parse(req.query);

  const data = await service.listPublicDirectory({
    specialtyId: query.specialtyId,
    search: query.search,
  });

  res.json({ data: query.limit === undefined ? data : data.slice(0, query.limit) });
});

/**
 * GET /api/doctors
 * Liste paginée et filtrable des médecins (réservée au personnel).
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = doctorListQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const result = await service.list(
    {
      specialtyId: query.specialtyId,
      departmentId: query.departmentId,
      accepting: query.accepting,
      search: query.search,
      sort: query.sort,
      order: query.order,
    },
    pagination,
  );

  res.json(paginated(result.data, result.meta.total, pagination));
});

/**
 * GET /api/doctors/:id/availability?date=AAAA-MM-JJ
 * Créneaux d'une journée, avec leur indicateur de disponibilité.
 */
export const availability: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const query = availabilityDateSchema.parse(req.query);

  const data = await service.getAvailability(id, query.date);
  res.json({ data });
});

/**
 * GET /api/doctors/:id
 * Fiche d'un médecin et statistiques d'activité.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getDetail(parseIdParam(req));
  res.json({ data });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/doctors
 * Crée un profil médecin (409 si le numéro d'ordre ou le compte est déjà pris,
 * 422 si la spécialité ou le département est inconnu).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const input = createDoctorSchema.parse(req.body);
  const data = await service.create(input);

  setAuditPayload(res, {
    resourceId: data.id,
    newValue: data,
  });

  res.status(201).json({ data });
});

/**
 * PATCH /api/doctors/:id
 * Met à jour partiellement un profil : le compte utilisateur lié n'est jamais
 * modifié par cette route.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const input = updateDoctorSchema.parse(req.body);
  const { before, after } = await service.update(id, input);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: before,
    newValue: after,
  });

  res.json({ data: after });
});

/**
 * DELETE /api/doctors/:id
 * Supprime un profil sans historique ; le compte utilisateur est conservé.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const deleted = await service.remove(id);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: deleted,
  });

  res.status(204).send();
});

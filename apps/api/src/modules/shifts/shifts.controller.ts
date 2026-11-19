/**
 * Contrôleurs HTTP du planning des gardes.
 *
 * Aucune règle métier ici : le contrôleur lit la requête validée par
 * `validate(...)`, appelle le service et met en forme la réponse.
 *
 * Les schémas locaux ci-dessous étendent les schémas partagés
 * (`listQuerySchema`, `shiftCalendarQuerySchema`) avec les filtres propres au
 * planning ; ils sont exportés pour que `shifts.routes.ts` puisse les brancher.
 */

import {
  type CreateShiftInput,
  SHIFT_STATUSES,
  SHIFT_TYPES,
  type ShiftStatus,
  type ShiftType,
  type UpdateShiftInput,
  createShiftSchema,
  dateSchema,
  idSchema,
  listQuerySchema,
  shiftCalendarQuerySchema,
  updateShiftSchema,
} from '@mediclinic/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './shifts.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/** Liste paginée : filtres médecin, département, type, statut et période. */
export const shiftListQuerySchema = listQuerySchema.extend({
  doctorId: idSchema.optional(),
  departmentId: idSchema.optional(),
  type: z.enum(SHIFT_TYPES).optional(),
  status: z.enum(SHIFT_STATUSES).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

/**
 * Planning : `from` / `to` restent optionnels afin que l'absence de paramètres
 * retombe sur le mois courant (choix produit de l'écran de planning).
 */
export const shiftCalendarRangeSchema = shiftCalendarQuerySchema.partial();

export { createShiftSchema, updateShiftSchema };

/* -------------------------------------------------------------------------- */
/* Types de requête validée                                                    */
/* -------------------------------------------------------------------------- */

interface ShiftListQuery {
  page: number;
  limit: number;
  sort?: string;
  order: 'asc' | 'desc';
  doctorId?: number;
  departmentId?: number;
  type?: ShiftType;
  status?: ShiftStatus;
  from?: string;
  to?: string;
}

interface ShiftCalendarQuery {
  from?: string;
  to?: string;
  departmentId?: number;
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/shifts
 * Liste paginée des gardes.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ShiftListQuery;
  const pagination = parsePagination(req.query);
  const result = await service.list(query, pagination);

  res.json(paginated(result.rows, result.total, pagination));
});

/**
 * GET /api/shifts/calendar
 * Planning sur une plage de dates, groupé par jour, avec les couleurs médecins.
 */
export const calendar: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ShiftCalendarQuery;
  const data = await service.calendar(query);

  res.json({ data });
});

/**
 * GET /api/shifts/me
 * Gardes du médecin connecté.
 */
export const mine: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  const pagination = parsePagination(req.query);
  const result = await service.listMine(req.user.doctorId, pagination);

  res.json(paginated(result.rows, result.total, pagination));
});

/**
 * GET /api/shifts/:id
 * Détail d'une garde.
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const shift = await service.getById(id);

  res.json({ data: shift });
});

/**
 * POST /api/shifts
 * Crée une garde (créateur = utilisateur connecté).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  // Le corps a déjà été validé et converti par le middleware `validate`.
  const body = req.body as CreateShiftInput;
  const shift = await service.create(body, req.user.id);

  setAuditPayload(res, {
    resourceId: shift.id,
    newValue: {
      doctorId: shift.doctor_id,
      departmentId: shift.department_id,
      startAt: shift.start_at,
      endAt: shift.end_at,
      type: shift.type,
    },
  });

  res.status(201).json({ data: shift });
});

/**
 * PATCH /api/shifts/:id
 * Modifie une garde (dates, médecin, département, type, statut, notes).
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const body = req.body as UpdateShiftInput;
  const shift = await service.update(id, body);

  setAuditPayload(res, {
    resourceId: id,
    newValue: {
      doctorId: shift.doctor_id,
      departmentId: shift.department_id,
      startAt: shift.start_at,
      endAt: shift.end_at,
      status: shift.status,
    },
  });

  res.json({ data: shift });
});

/**
 * DELETE /api/shifts/:id
 * Suppression définitive d'une garde.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  await service.remove(id);

  setAuditPayload(res, { resourceId: id });
  res.status(204).send();
});

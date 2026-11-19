/**
 * Contrôleurs HTTP du module laboratoire.
 *
 * Le contrôleur valide l'entrée avec les schémas partagés (`createLabRequestSchema`,
 * `updateLabRequestSchema`, `listQuerySchema`, `idSchema`), appelle le service,
 * prépare la charge d'audit et formate la réponse. Aucune règle métier, aucun SQL.
 */

import {
  createLabRequestSchema,
  idSchema,
  listQuerySchema,
  updateLabRequestSchema,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as service from './lab.service.js';

/** Catalogue : création d'une analyse. */
const createLabTestSchema = z.object({
  name: z.string().trim().min(2, 'Le nom de l’analyse est obligatoire').max(120),
  category: z.string().trim().min(2, 'La catégorie est obligatoire').max(80),
  price: z.coerce.number().min(0, 'Le prix ne peut pas être négatif').max(99_999_999),
  turnaroundHours: z.coerce
    .number()
    .int()
    .min(1, 'Le délai minimal est d’une heure')
    .max(720, 'Le délai maximal est de 720 heures')
    .optional(),
});

/** Catalogue : mise à jour partielle d'une analyse. */
const updateLabTestSchema = createLabTestSchema.partial();

/** Liste des demandes : pagination + filtres métier. */
const labRequestQuerySchema = listQuerySchema.extend({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  patientId: z.coerce.number().int().positive().optional(),
  doctorId: z.coerce.number().int().positive().optional(),
});

/** Récupère l'utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Lit et valide un paramètre de route entier. */
function readId(req: Request, name = 'id'): number {
  return idSchema.parse(req.params[name]);
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/lab/tests
 * Catalogue complet des analyses.
 */
export const listTests: RequestHandler = asyncHandler(async (_req, res) => {
  const tests = await service.listTests();
  res.json({ data: tests });
});

/**
 * POST /api/lab/tests
 * Ajoute une analyse au catalogue (nom unique).
 */
export const createTest: RequestHandler = asyncHandler(async (req, res) => {
  const input = createLabTestSchema.parse(req.body);
  const test = await service.createTest(input);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'lab',
    resourceId: test.id,
    newValue: test,
  });

  res.status(201).json({ data: test });
});

/**
 * PATCH /api/lab/tests/:id
 * Modifie une analyse du catalogue.
 */
export const updateTest: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const input = updateLabTestSchema.parse(req.body);

  const before = await service.getTestOrFail(id);
  const test = await service.updateTest(id, input);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'lab',
    resourceId: test.id,
    oldValue: service.toLabTest(before),
    newValue: test,
  });

  res.json({ data: test });
});

/* -------------------------------------------------------------------------- */
/* Demandes d'analyse                                                          */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/lab/requests
 * Liste paginée des demandes, filtres statut / patient / médecin / recherche.
 */
export const listRequests: RequestHandler = asyncHandler(async (req, res) => {
  const query = labRequestQuerySchema.parse(req.query);
  const result = await service.listRequests(
    {
      search: query.search,
      status: query.status,
      patientId: query.patientId,
      doctorId: query.doctorId,
      sort: query.sort,
      order: query.order,
    },
    parsePagination(query),
  );

  res.json(result);
});

/**
 * GET /api/lab/requests/:id
 * Détail d'une demande (noms patient, médecin et analyse inclus).
 */
export const requestDetail: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const request = await service.getRequestOrFail(id);
  res.json({ data: service.toLabRequest(request) });
});

/**
 * POST /api/lab/requests
 * Prescrit une analyse. Un médecin ne peut prescrire que pour lui-même.
 */
export const createRequest: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const input = createLabRequestSchema.parse(req.body);

  const request = await service.createRequest(user, {
    patientId: input.patientId,
    doctorId: input.doctorId,
    labTestId: input.labTestId,
    notes: input.notes,
  });

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'lab',
    resourceId: request.id,
    newValue: request,
  });

  res.status(201).json({ data: request });
});

/**
 * PATCH /api/lab/requests/:id
 * Fait avancer la demande (statut, résultat) ; `completed_at` est automatique.
 */
export const updateRequest: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const input = updateLabRequestSchema.parse(req.body);

  const before = await service.getRequestOrFail(id);
  const request = await service.updateRequest(id, input);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'lab',
    resourceId: request.id,
    oldValue: service.toLabRequest(before),
    newValue: request,
  });

  res.json({ data: request });
});

/**
 * DELETE /api/lab/requests/:id
 * Annule la demande si un résultat existe, la supprime sinon.
 */
export const deleteRequest: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const before = await service.getRequestOrFail(id);

  const { cancelled } = await service.deleteRequest(id);

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'lab',
    resourceId: id,
    oldValue: service.toLabRequest(before),
    newValue: { cancelled, resultPreserved: cancelled },
  });

  res.status(204).send();
});

/**
 * GET /api/lab/requests/patient/:patientId
 * Demandes d'un patient.
 */
export const requestsByPatient: RequestHandler = asyncHandler(async (req, res) => {
  const patientId = readId(req, 'patientId');
  const requests = await service.listRequestsByPatient(patientId);
  res.json({ data: requests });
});

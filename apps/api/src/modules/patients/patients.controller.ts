/**
 * Contrôleurs HTTP du module patients.
 *
 * Aucune règle métier ici : le contrôleur valide l'entrée avec les schémas
 * partagés, appelle le service, prépare la charge d'audit et met en forme la
 * réponse (`{ data }`, `{ data, meta }` ou 204).
 */

import {
  createPatientSchema,
  idSchema,
  patientQuerySchema,
  updatePatientSchema,
  updateProfileSchema,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as service from './patients.service.js';

/** Corps de `POST /:id/account` : seul le mot de passe est attendu. */
const createAccountSchema = z.object({
  password: z
    .string({ required_error: 'Le mot de passe est obligatoire' })
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(72, 'Le mot de passe ne peut pas dépasser 72 caractères')
    .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
});

/** Récupère l'utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Lit et valide l'identifiant de route. */
function readId(req: Request, name = 'id'): number {
  return idSchema.parse(req.params[name]);
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/patients
 * Liste paginée, filtres `search`, `gender`, `bloodGroup` et tri en liste blanche.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = patientQuerySchema.parse(req.query);
  const result = await service.listPatients(
    {
      search: query.search,
      gender: query.gender,
      bloodGroup: query.bloodGroup,
      sort: query.sort,
      order: query.order,
    },
    parsePagination(query),
  );

  res.json(result);
});

/**
 * GET /api/patients/me
 * Dossier du patient rattaché au compte connecté (portail patient).
 */
export const me: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const patientId = await service.resolveOwnPatientId(user);
  const patient = await service.getPatientOrFail(patientId);

  res.json({ data: service.toPatient(patient) });
});

/**
 * GET /api/patients/:id
 * Détail d'un dossier. Un compte patient n'accède qu'à son propre dossier.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  service.assertCanAccessPatient(user, id);

  const patient = await service.getPatientOrFail(id);
  res.json({ data: service.toPatient(patient) });
});

/**
 * GET /api/patients/:id/history
 * Dossier consolidé : patient, rendez-vous, consultations, ordonnances
 * (lignes incluses), factures et chronologie issue de `v_patient_history`.
 */
export const history: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  service.assertCanAccessPatient(user, id);

  const payload = await service.getPatientHistory(id);
  res.json({ data: payload });
});

/**
 * GET /api/patients/:id/appointments
 * Rendez-vous du patient (vue `v_appointment_details`), paginés.
 */
export const appointments: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  service.assertCanAccessPatient(user, id);

  const result = await service.listPatientAppointments(id, parsePagination(req.query));
  res.json(result);
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/patients
 * Crée un dossier patient, rattaché à un compte existant si l'email correspond.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const input = createPatientSchema.parse(req.body);

  const data = await service.prepareCreate(input);
  const patient = await service.createPatient(data);

  setAuditPayload(res, {
    resourceId: patient.id,
    newValue: { ...patient, linkedUserId: data.userId },
  });

  res.status(201).json({ data: patient });
});

/**
 * PATCH /api/patients/:id
 * Mise à jour partielle d'un dossier.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  const input = updatePatientSchema.parse(req.body);

  service.assertCanAccessPatient(user, id);

  const before = await service.getPatientOrFail(id);
  const patient = await service.updatePatient(id, input);

  setAuditPayload(res, {
    resourceId: patient.id,
    oldValue: service.toPatient(before),
    newValue: patient,
  });

  res.json({ data: patient });
});

/**
 * PATCH /api/patients/me
 * Mise à jour du profil par le patient connecté (téléphone répercuté sur `users`).
 */
export const updateMe: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const input = updateProfileSchema.parse(req.body);

  const patientId = await service.resolveOwnPatientId(user);
  const before = await service.getPatientOrFail(patientId);
  const patient = await service.updateOwnProfile(before, input);

  setAuditPayload(res, {
    resourceId: patient.id,
    oldValue: service.toPatient(before),
    newValue: patient,
  });

  res.json({ data: patient });
});

/**
 * DELETE /api/patients/:id
 * Refuse la suppression si le dossier porte un historique médical (409).
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const before = await service.getPatientOrFail(id);

  await service.deletePatient(id);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: service.toPatient(before),
  });

  res.status(204).send();
});

/**
 * POST /api/patients/:id/account
 * Crée le compte portail d'un patient existant et lui attribue le rôle PATIENT.
 */
export const createAccount: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const { password } = createAccountSchema.parse(req.body);

  const patient = await service.getPatientOrFail(id);
  const account = await service.createPortalAccount(patient, password);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'patient',
    resourceId: id,
    newValue: { userId: account.id, email: account.email, portal: true },
  });

  res.status(201).json({ data: account });
});

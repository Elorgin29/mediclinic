/**
 * Contrôleurs HTTP du module ordonnances.
 *
 * Aucune règle métier ici : le contrôleur valide l'entrée avec les schémas
 * partagés, applique la règle d'identité du médecin (seul endroit où
 * `req.user` est disponible avant l'appel au service), prépare la charge
 * d'audit et met en forme la réponse (`{ data }`, `{ data, meta }` ou 204).
 */

import {
  createPrescriptionSchema,
  idSchema,
  listQuerySchema,
  updatePrescriptionSchema,
} from '@mediclinic/shared';
import type { PrescriptionStatus } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as service from './prescriptions.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas locaux (complètent ceux de @mediclinic/shared)                     */
/* -------------------------------------------------------------------------- */

/** Paramètre d'URL commun `:id`. */
export const idParamsSchema = z.object({ id: idSchema });

/** Paramètre d'URL `:patientId`. */
export const patientParamsSchema = z.object({ patientId: idSchema });

/** Filtres de liste, au-delà du schéma partagé (pagination, tri, recherche). */
const prescriptionListQuerySchema = listQuerySchema.extend({
  doctorId: idSchema.optional(),
  patientId: idSchema.optional(),
  status: z.enum(['ISSUED', 'DISPENSED', 'CANCELLED']).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

/**
 * Corps de `PATCH /:id`.
 *
 * `updatePrescriptionSchema` ne couvre que le statut ; le remplacement des
 * lignes y est ajouté ici, avec les mêmes règles que la création (au moins un
 * médicament lorsqu'une liste est fournie).
 */
const updateBodySchema = updatePrescriptionSchema.partial().extend({
  items: z
    .array(
      z.object({
        medicationId: idSchema,
        dosage: z.string().trim().min(1, 'Posologie requise').max(120),
        frequency: z.string().trim().min(1, 'Fréquence requise').max(120),
        duration: z.string().trim().min(1, 'Durée requise').max(120),
        instructions: z.string().trim().max(500).optional(),
        quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(1000).default(1),
      }),
    )
    .min(1, 'Ajoutez au moins un médicament')
    .optional(),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Récupère l'utilisateur authentifié (garanti par `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Lit et valide un paramètre de route entier. */
function readId(req: Request, name = 'id'): number {
  return idSchema.parse(req.params[name]);
}

/** Garantit qu'un compte patient n'accède qu'à ses propres ordonnances. */
function assertCanReadPatient(user: AuthUser, patientId: number): void {
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== patientId) {
    throw AppError.forbidden(
      'Vous ne pouvez accéder qu’à vos propres ordonnances.',
      'NOT_YOUR_PRESCRIPTION',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/prescriptions
 * Liste paginée des ordonnances (vue `v_prescription_details`), lignes
 * comprises, avec filtres médecin / patient / statut / période / recherche.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const query = prescriptionListQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  // Un compte patient ne voit jamais les ordonnances d'un autre patient : on
  // force le filtre à son dossier, même si un autre patientId est fourni.
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  const patientId = isPatientOnly ? (user.patientId ?? undefined) : query.patientId;

  const result = await service.listPrescriptions(
    {
      page: pagination.page,
      limit: pagination.limit,
      search: query.search,
      sort: query.sort,
      order: query.order,
      doctorId: query.doctorId,
      patientId,
      status: query.status,
      from: query.from,
      to: query.to,
    },
    pagination,
  );

  res.json(result);
});

/**
 * GET /api/prescriptions/patient/:patientId
 * Ordonnances d'un patient. Déclaré AVANT `/:id` dans le routeur, sinon
 * Express interpréterait « patient » comme un identifiant.
 */
export const listByPatient: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const patientId = readId(req, 'patientId');
  assertCanReadPatient(user, patientId);

  const query = listQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const result = await service.listPrescriptionsByPatient(
    patientId,
    pagination,
    query.sort,
    query.order,
  );

  res.json(result);
});

/**
 * GET /api/prescriptions/me
 * Ordonnances du patient connecté (portail patient, sans permission staff).
 */
export const mine: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  if (user.patientId === null) {
    throw AppError.forbidden('Cette ressource est réservée aux comptes patients.', 'NOT_A_PATIENT');
  }
  const query = listQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const result = await service.listPrescriptionsByPatient(
    user.patientId,
    pagination,
    query.sort,
    query.order,
  );

  res.json(result);
});

/**
 * GET /api/prescriptions/:id
 * Ordonnance complète, avec ses lignes et le médicament dénommé.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);
  const prescription = await service.getPrescription(id);
  assertCanReadPatient(user, prescription.patient_id);
  res.json({ data: prescription });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/prescriptions
 * Crée une ordonnance et ses lignes (transaction).
 *
 * `doctor_id` provient de la consultation ; un compte médecin ne peut prescrire
 * que pour ses propres consultations (403 sinon).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const input = createPrescriptionSchema.parse(req.body);

  const consultation = await service.getConsultationOrFail(input.consultationId);
  service.assertDoctorCanPrescribe(user, consultation);

  const created = await service.createPrescription(input);

  setAuditPayload(res, {
    resourceId: created.id,
    newValue: {
      consultationId: created.consultation_id,
      patientId: created.patient_id,
      doctorId: created.doctor_id,
      status: created.status,
      items: created.items.map((item) => ({
        medicationId: item.medication_id,
        quantity: item.quantity,
      })),
    },
  });

  res.status(201).json({ data: created });
});

/**
 * POST /api/prescriptions/:id/dispense
 * Dispense l'ordonnance : contrôle de stock agrégé, statut `DISPENSED` et un
 * mouvement `OUT` par ligne, dans une transaction.
 */
export const dispense: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = readId(req);

  const dispensed = await service.dispensePrescription(id, user);

  setAuditPayload(res, {
    resourceId: dispensed.id,
    newValue: {
      status: dispensed.status,
      dispensedBy: user.id,
      items: dispensed.items.map((item) => ({
        medicationId: item.medication_id,
        quantity: item.quantity,
      })),
    },
  });

  res.json({ data: dispensed });
});

/**
 * PATCH /api/prescriptions/:id
 * Change le statut et/ou remplace les lignes (transaction).
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const input = updateBodySchema.parse(req.body);

  const updated = await service.updatePrescription(id, {
    status: input.status as PrescriptionStatus | undefined,
    items: input.items,
  });

  setAuditPayload(res, {
    resourceId: updated.id,
    newValue: {
      status: updated.status,
      ...(input.items === undefined
        ? {}
        : { items: input.items.map((item) => ({ medicationId: item.medicationId, quantity: item.quantity })) }),
    },
  });

  res.json({ data: updated });
});

/**
 * DELETE /api/prescriptions/:id
 * Annulation logique si l'ordonnance a été dispensée (le stock a bougé),
 * suppression physique sinon.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = readId(req);
  const { cancelled } = await service.deletePrescription(id);

  setAuditPayload(res, {
    resourceId: id,
    newValue: { cancelled },
  });

  res.status(204).send();
});

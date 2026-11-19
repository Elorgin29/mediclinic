/**
 * Contrôleurs HTTP du module « consultations ».
 *
 * Aucune règle métier ici : le contrôleur valide l'entrée avec les schémas
 * partagés, appelle le service, prépare la charge d'audit et met en forme la
 * réponse (`{ data }`, `{ data, meta }` ou 204).
 *
 * Seule exception assumée : la restriction « un médecin ne modifie que ses
 * propres consultations ». Elle dépend de `req.user`, que seul le contrôleur
 * connaît ; le service, lui, ne reçoit que des données métier.
 */

import {
  createConsultationSchema,
  idSchema,
  listQuerySchema,
  updateConsultationSchema,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler } from '../../utils/http.js';
import { likePattern, parsePagination } from '../../utils/pagination.js';
import * as service from './consultations.service.js';
import type { ConsultationDetail, ConsultationView } from './consultations.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/** Liste paginée : filtres médecin, patient, période et recherche. */
export const consultationQuerySchema = listQuerySchema.extend({
  doctorId: idSchema.optional(),
  patientId: idSchema.optional(),
  from: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Date invalide')
    .optional(),
  to: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Date invalide')
    .optional(),
});

/** Paramètre d'URL `:id`. */
export const consultationIdParamsSchema = z.object({ id: idSchema });

/** Paramètre d'URL `:patientId` (route `GET /patient/:patientId`). */
export const patientIdParamsSchema = z.object({ patientId: idSchema });

export { createConsultationSchema, updateConsultationSchema };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Récupère l'utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/**
 * Interdit à un médecin de modifier ou supprimer la consultation d'un confrère.
 *
 * Les comptes non médicaux (secrétariat, administration) ne portent pas de
 * `doctorId` et ne sont donc pas restreints : leur habilitation est déjà bornée
 * par la permission `consultation:update` / `consultation:delete`.
 */
function assertOwnConsultation(user: AuthUser, consultation: { doctor_id: number }): void {
  if (user.doctorId !== null && user.doctorId !== consultation.doctor_id) {
    throw AppError.forbidden(
      'Vous ne pouvez modifier que les consultations dont vous êtes l’auteur.',
      'NOT_YOUR_CONSULTATION',
    );
  }
}

/** Extrait le corps ou lève un 400 explicite si celui-ci est absent. */
function bodyOf(req: Request): unknown {
  return req.body ?? {};
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/consultations
 * Liste paginée (vue `v_consultation_details`), filtres médecin, patient,
 * période et recherche sur le nom du patient ou le diagnostic.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = consultationQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const result = await service.list(
    {
      ...(query.doctorId === undefined ? {} : { doctorId: query.doctorId }),
      ...(query.patientId === undefined ? {} : { patientId: query.patientId }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      // L'échappement des jokers est fait ici : le repository reçoit un motif
      // déjà neutralisé et n'a plus qu'à le passer en paramètre.
      ...(query.search === undefined || query.search === ''
        ? {}
        : { search: likePattern(query.search) }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      order: query.order,
    },
    pagination,
  );

  res.json(result);
});

/**
 * GET /api/consultations/:id
 * Détail d'une consultation, ordonnances et lignes comprises.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const { id } = consultationIdParamsSchema.parse(req.params);
  res.json({ data: await service.detail(id) });
});

/**
 * GET /api/consultations/patient/:patientId
 * Consultations d'un patient, de la plus récente à la plus ancienne.
 */
export const byPatient: RequestHandler = asyncHandler(async (req, res) => {
  const { patientId } = patientIdParamsSchema.parse(req.params);
  res.json({ data: await service.listByPatient(patientId) });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/consultations
 * Saisit le compte-rendu d'un rendez-vous et le passe à `COMPLETED`.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const input = createConsultationSchema.parse(bodyOf(req));
  const created = await service.create(input);

  setAuditPayload(res, {
    resourceId: created.id,
    newValue: {
      appointmentId: created.appointment_id,
      doctorId: created.doctor_id,
      patientId: created.patient_id,
      followUpAt: created.follow_up_at,
    },
  });

  res.status(201).json({ data: created });
});

/**
 * PATCH /api/consultations/:id
 * Met à jour le diagnostic, les notes ou la date de suivi.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { id } = consultationIdParamsSchema.parse(req.params);
  const input = updateConsultationSchema.parse(bodyOf(req));

  const before = await service.getConsultationOrFail(id);
  assertOwnConsultation(user, before);

  const updated = await service.update(id, input);

  setAuditPayload(res, {
    resourceId: updated.id,
    oldValue: toAuditValue(service.toConsultation(before)),
    newValue: toAuditValue(updated),
  });

  res.json({ data: updated });
});

/**
 * DELETE /api/consultations/:id
 * Suppression définitive (204) ; les ordonnances suivent en cascade.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { id } = consultationIdParamsSchema.parse(req.params);

  const before = await service.getConsultationOrFail(id);
  assertOwnConsultation(user, before);

  await service.remove(id);

  setAuditPayload(res, {
    resourceId: id,
    oldValue: toAuditValue(service.toConsultation(before)),
  });

  res.status(204).send();
});

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Réduit une consultation à ses champs significatifs pour le journal d'audit :
 * le diagnostic et les notes peuvent être volumineux, seuls leurs indicateurs
 * sont conservés, sans données médicales nominatives inutiles.
 */
function toAuditValue(
  consultation: ConsultationView | ConsultationDetail,
): Record<string, unknown> {
  return {
    appointmentId: consultation.appointment_id,
    doctorId: consultation.doctor_id,
    patientId: consultation.patient_id,
    diagnosisLength: consultation.diagnosis.length,
    hasNotes: consultation.notes !== null && consultation.notes.length > 0,
    followUpAt: consultation.follow_up_at,
  };
}

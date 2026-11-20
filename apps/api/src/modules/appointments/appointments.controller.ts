/**
 * Contrôleurs HTTP du module « rendez-vous ».
 *
 * Aucune règle métier ici : uniquement l'extraction des données validées de la
 * requête, l'appel au service et la mise en forme de la réponse.
 */

import { dateSchema, idSchema, type AppointmentStatus } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import * as appointmentsService from './appointments.service.js';
import type {
  AppointmentListQuery,
  UpdateAppointmentPayload,
} from './appointments.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas locaux (complètent ceux de @mediclinic/shared)                     */
/* -------------------------------------------------------------------------- */

/** Paramètre d'URL commun `:id`. */
export const idParamsSchema = z.object({ id: idSchema });

/** Query string de `GET /api/appointments/calendar`. */
export const calendarQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Récupère l'utilisateur authentifié (les routes concernées passent par `authenticate`). */
function currentUser(req: Request): AuthUser {
  if (!req.user) {
    throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  }
  return req.user;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/appointments
 * Liste paginée des rendez-vous (vue `v_appointment_details`).
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== null) {
    (req.query as Record<string, unknown>).patientId = String(user.patientId);
  }
  const result = await appointmentsService.list(req.query as unknown as AppointmentListQuery);
  res.json(result);
});

/**
 * GET /api/appointments/today
 * Rendez-vous de la journée, triés par heure.
 */
export const today: RequestHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await appointmentsService.today() });
});

/**
 * GET /api/appointments/calendar?from&to
 * Agenda d'une plage de dates (semaine courante par défaut), groupé par jour.
 */
export const calendar: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as unknown as { from?: string; to?: string };
  res.json({ data: await appointmentsService.calendar(query.from, query.to) });
});

/**
 * GET /api/appointments/me
 * Rendez-vous du patient connecté (403 si le compte n'est pas un patient).
 */
export const me: RequestHandler = asyncHandler(async (req, res) => {
  res.json({ data: await appointmentsService.mine(currentUser(req)) });
});

/**
 * GET /api/appointments/:id
 * Détail d'un rendez-vous et consultation éventuellement liée.
 */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const id = parseIdParam(req);
  const appointment = await appointmentsService.detail(id);
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== appointment.patient_id) {
    throw AppError.forbidden('Vous ne pouvez accéder qu’à vos propres rendez-vous.', 'NOT_YOUR_APPOINTMENT');
  }
  res.json({ data: appointment });
});

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/appointments
 * Crée un rendez-vous (réunion Zoom automatique pour une téléconsultation).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const created = await appointmentsService.create(req.body, user);

  setAuditPayload(res, {
    resourceId: created.id,
    newValue: {
      patientId: created.patient_id,
      doctorId: created.doctor_id,
      scheduledAt: created.scheduled_at,
      duration: created.duration,
      type: created.type,
    },
  });

  res.status(201).json({ data: created });
});

/**
 * PATCH /api/appointments/:id
 * Mise à jour partielle, replanification comprise.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const user = currentUser(req);
  const input = req.body as UpdateAppointmentPayload;
  const updated = await appointmentsService.update(id, input, user);

  setAuditPayload(res, {
    resourceId: updated.id,
    newValue: input,
  });

  res.json({ data: updated });
});

/**
 * PATCH /api/appointments/:id/status
 * Change le statut (motif exigé pour annuler ou débloquer un rendez-vous figé).
 */
export const updateStatus: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const user = currentUser(req);
  const payload = req.body as { status: AppointmentStatus; reason?: string };
  const updated = await appointmentsService.updateStatus(id, payload, user);

  setAuditPayload(res, {
    resourceId: updated.id,
    newValue: { status: updated.status, reason: payload.reason ?? null },
  });

  res.json({ data: updated });
});

/**
 * DELETE /api/appointments/:id
 * Suppression définitive (204).
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  await appointmentsService.remove(id, currentUser(req));
  res.status(204).send();
});

/**
 * POST /api/appointments/public
 * Prise de rendez-vous en ligne, sans authentification.
 */
export const publicBooking: RequestHandler = asyncHandler(async (req, res) => {
  const result = await appointmentsService.publicBooking(req.body);

  setAuditPayload(res, {
    resourceId: result.appointment.id,
    newValue: {
      source: 'réservation en ligne',
      patientId: result.appointment.patient_id,
      patientCreated: result.patientCreated,
      doctorId: result.appointment.doctor_id,
      scheduledAt: result.appointment.scheduled_at,
    },
  });

  res.status(201).json({ data: result });
});

/**
 * Contrôleurs HTTP des téléconsultations.
 *
 * Aucune règle métier ici : le contrôleur lit la requête déjà validée par
 * `validate(...)`, appelle le service et met en forme la réponse.
 *
 * Les schémas locaux ci-dessous étendent les schémas partagés lorsque la route
 * a besoin d'un paramètre supplémentaire ; ils sont exportés pour que
 * `meetings.routes.ts` puisse les brancher sur `validate()`.
 */

import {
  dateSchema,
  idSchema,
  meetingQuerySchema,
  meetingRejectSchema,
  meetingRequestSchema,
  meetingSignatureQuerySchema,
  type MeetingStatus,
} from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './meetings.service.js';

/* -------------------------------------------------------------------------- */
/* Schémas d'entrée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Filtres de liste : le schéma partagé est complété des bornes de période.
 * `meetingQuerySchema` couvre déjà `status`, `patientId`, `doctorId`,
 * `search`, `sort`, `order` et la pagination.
 */
export const meetingListQuerySchema = meetingQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

/**
 * Demande de téléconsultation.
 * `patientId` reste optionnel : le secrétariat peut déposer une demande pour un
 * patient, alors qu'un compte patient le déduit de son propre dossier.
 */
export const meetingRequestInputSchema = meetingRequestSchema.extend({
  patientId: idSchema.optional(),
});

export { meetingRejectSchema, meetingSignatureQuerySchema };

/** Identifiant de route (`:id` entier positif). */
export const meetingIdParamsSchema = z.object({ id: idSchema });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Utilisateur authentifié (garanti par le middleware `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** Query de liste déjà normalisée par `validate(...)`. */
interface MeetingListQuery {
  page?: number;
  limit?: number;
  status?: MeetingStatus;
  patientId?: number;
  doctorId?: number;
  from?: string;
  to?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/meetings
 * Liste paginée des téléconsultations (vue `v_active_meetings`).
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const query = req.query as unknown as MeetingListQuery;
  const pagination = parsePagination(req.query);

  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  const forcedPatientId = isPatientOnly ? (user.patientId ?? undefined) : undefined;

  const { data, total } = await service.list(
    {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.doctorId === undefined ? {} : { doctorId: query.doctorId }),
      ...(forcedPatientId !== undefined ? { patientId: forcedPatientId } : query.patientId === undefined ? {} : { patientId: query.patientId }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.sort === undefined ? {} : { sort: query.sort }),
      ...(query.order === undefined ? {} : { order: query.order }),
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/meetings/me
 * Téléconsultations du patient connecté. Déclaré AVANT `/:id`.
 */
export const mine: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const pagination = parsePagination(req.query);
  const { data, total } = await service.listMine(user, pagination);

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/meetings/:id
 * Détail enrichi, avec la fenêtre de connexion recalculée côté serveur.
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const meeting = await service.getById(id);

  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== meeting.patient_id) {
    throw AppError.forbidden('Vous ne pouvez accéder qu’à vos propres téléconsultations.', 'NOT_YOUR_MEETING');
  }

  res.json({ data: meeting });
});

/**
 * POST /api/meetings/request
 * Dépose une demande de téléconsultation (statut `PENDING`).
 */
export const request: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const body = req.body as z.infer<typeof meetingRequestInputSchema>;

  const meeting = await service.requestMeeting(
    {
      doctorId: body.doctorId,
      reason: body.reason,
      preferredAt: body.preferredAt,
      duration: body.duration,
      ...(body.patientId === undefined ? {} : { patientId: body.patientId }),
    },
    user,
  );

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'meeting',
    resourceId: meeting.id,
    newValue: {
      patientId: meeting.patient_id,
      doctorId: meeting.doctor_id,
      preferredAt: meeting.preferred_at,
      duration: meeting.duration,
    },
  });

  res.status(201).json({ data: meeting });
});

/**
 * POST /api/meetings/:id/approve
 * Approuve la demande : réunion Zoom + rendez-vous de téléconsultation.
 */
export const approve: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = parseIdParam(req);

  const result = await service.approve(id, user);

  setAuditPayload(res, {
    action: 'APPROVE',
    resource: 'meeting',
    resourceId: id,
    newValue: {
      status: result.meeting.status,
      zoomMeetingId: result.meeting.zoom_meeting_id,
      appointmentId: result.appointmentId,
      simulated: result.simulated,
    },
  });

  res.json({ data: result });
});

/**
 * POST /api/meetings/:id/reject
 * Refuse une demande en attente et notifie le patient.
 */
export const reject: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const body = req.body as z.infer<typeof meetingRejectSchema>;

  const meeting = await service.reject(id, body.reason, user);

  setAuditPayload(res, {
    action: 'REJECT',
    resource: 'meeting',
    resourceId: id,
    newValue: { status: meeting.status, rejectionReason: body.reason },
  });

  res.json({ data: meeting });
});

/**
 * POST /api/meetings/:id/cancel
 * Annule la téléconsultation et tente de supprimer la réunion Zoom.
 */
export const cancel: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const meeting = await service.cancel(id);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'meeting',
    resourceId: id,
    newValue: { status: meeting.status },
  });

  res.json({ data: meeting });
});

/**
 * GET /api/meetings/:id/join-token
 * Jeton de connexion au Meeting SDK (fenêtre de connexion exigée).
 */
export const joinToken: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = parseIdParam(req);

  const token = await service.getJoinToken(id, user);
  res.json({ data: token });
});

/**
 * GET /api/meetings/:id/signature?role=0|1
 * Signature JWT du Meeting SDK, complétée du code d'accès de la réunion.
 */
export const signature: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const id = parseIdParam(req);
  const query = req.query as unknown as z.infer<typeof meetingSignatureQuerySchema>;

  const result = await service.getSignature(id, query.role === 1 ? 1 : 0, user);
  res.json({ data: result });
});

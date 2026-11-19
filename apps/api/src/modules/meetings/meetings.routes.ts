/**
 * Routes des téléconsultations (`/api/meetings`).
 *
 * L'ordre de déclaration est significatif : `/me` est déclaré AVANT `/:id`,
 * sinon Express interpréterait « me » comme un identifiant de téléconsultation.
 *
 * Les contrôleurs valident eux-mêmes le corps (`validate` peut aussi le faire) :
 * les schémas sont exportés par le contrôleur pour rester au plus près des
 * routes qui les utilisent.
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './meetings.controller.js';

export const meetingsRouter = Router();

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée (filtres statut, médecin, patient, période, recherche). */
meetingsRouter.get(
  '/',
  authenticate,
  requirePermission('meeting:read'),
  validate({ query: controller.meetingListQuerySchema }),
  controller.list,
);

/** Téléconsultations du patient connecté — AVANT `/:id`. */
meetingsRouter.get('/me', authenticate, controller.mine);

/** Détail d'une téléconsultation. */
meetingsRouter.get(
  '/:id',
  authenticate,
  requirePermission('meeting:read'),
  validate({ params: controller.meetingIdParamsSchema }),
  controller.getById,
);

/* -------------------------------------------------------------------------- */
/* Cycle de vie                                                                */
/* -------------------------------------------------------------------------- */

/** Demande de téléconsultation (statut `PENDING`). */
meetingsRouter.post(
  '/request',
  authenticate,
  requirePermission('meeting:create'),
  validate({ body: controller.meetingRequestInputSchema }),
  auditTrail('CREATE', 'meeting'),
  controller.request,
);

/** Approbation : réunion Zoom + rendez-vous de téléconsultation. */
meetingsRouter.post(
  '/:id/approve',
  authenticate,
  requirePermission('meeting:manage'),
  validate({ params: controller.meetingIdParamsSchema }),
  auditTrail('APPROVE', 'meeting'),
  controller.approve,
);

/** Refus d'une demande en attente. */
meetingsRouter.post(
  '/:id/reject',
  authenticate,
  requirePermission('meeting:manage'),
  validate({ params: controller.meetingIdParamsSchema, body: controller.meetingRejectSchema }),
  auditTrail('REJECT', 'meeting'),
  controller.reject,
);

/** Annulation. */
meetingsRouter.post(
  '/:id/cancel',
  authenticate,
  requirePermission('meeting:update'),
  validate({ params: controller.meetingIdParamsSchema }),
  auditTrail('UPDATE', 'meeting'),
  controller.cancel,
);

/* -------------------------------------------------------------------------- */
/* Accès Zoom                                                                  */
/* -------------------------------------------------------------------------- */

/** Jeton de connexion au Meeting SDK (fenêtre de connexion exigée). */
meetingsRouter.get(
  '/:id/join-token',
  authenticate,
  requirePermission('meeting:read'),
  validate({ params: controller.meetingIdParamsSchema }),
  controller.joinToken,
);

/** Signature Zoom du Meeting SDK (`?role=0|1`). */
meetingsRouter.get(
  '/:id/signature',
  authenticate,
  requirePermission('meeting:read'),
  validate({
    params: controller.meetingIdParamsSchema,
    query: controller.meetingSignatureQuerySchema,
  }),
  controller.signature,
);

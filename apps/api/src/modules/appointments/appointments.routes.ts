/**
 * Routes du module « rendez-vous », montées sur `/api/appointments`.
 *
 * Ordre de déclaration crucial : les chemins littéraux (`/today`, `/calendar`,
 * `/me`, `/public`) sont enregistrés AVANT les routes paramétrées (`/:id`),
 * sinon Express interpréterait « today » ou « me » comme un identifiant et
 * renverrait systématiquement un 400 « identifiant invalide ».
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 *
 * `POST /public` est la seule route sans `authenticate` : elle permet au
 * formulaire de prise de rendez-vous du site vitrine de fonctionner sans
 * compte. L'audit y reste actif : la ressource créée doit être traçable.
 */

import {
  appointmentQuerySchema,
  appointmentStatusSchema,
  createAppointmentSchema,
  publicBookingSchema,
  updateAppointmentSchema,
} from '@mediclinic/shared';
import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './appointments.controller.js';

export const appointmentsRouter = Router();

/* -------------------------------------------------------------------------- */
/* Lectures particulières — déclarées avant `/:id`                             */
/* -------------------------------------------------------------------------- */

/** Rendez-vous de la journée, triés par heure. */
appointmentsRouter.get(
  '/today',
  authenticate,
  requirePermission('appointment:read'),
  controller.today,
);

/** Agenda d'une plage de dates (`from` / `to`), groupé par jour. */
appointmentsRouter.get(
  '/calendar',
  authenticate,
  requirePermission('appointment:read'),
  validate({ query: controller.calendarQuerySchema }),
  controller.calendar,
);

/**
 * Rendez-vous du patient connecté.
 * Aucune permission n'est exigée au-delà de l'authentification : le service
 * vérifie que le compte porte bien un dossier patient (403 sinon).
 */
appointmentsRouter.get('/me', authenticate, controller.me);

/**
 * Prise de rendez-vous en ligne (route publique).
 * `validate` s'exécute avant `auditTrail` : une requête invalide ne doit pas
 * produire d'entrée d'audit.
 */
appointmentsRouter.post(
  '/public',
  validate({ body: publicBookingSchema }),
  auditTrail('CREATE', 'appointment'),
  controller.publicBooking,
);

/* -------------------------------------------------------------------------- */
/* Collection                                                                  */
/* -------------------------------------------------------------------------- */

/** Liste paginée et filtrée des rendez-vous. */
appointmentsRouter.get(
  '/',
  authenticate,
  requirePermission('appointment:read'),
  validate({ query: appointmentQuerySchema }),
  controller.list,
);

/** Création d'un rendez-vous (réunion Zoom automatique en téléconsultation). */
appointmentsRouter.post(
  '/',
  authenticate,
  requirePermission('appointment:create'),
  validate({ body: createAppointmentSchema }),
  auditTrail('CREATE', 'appointment'),
  controller.create,
);

/* -------------------------------------------------------------------------- */
/* Ressource individuelle                                                      */
/* -------------------------------------------------------------------------- */

/** Détail d'un rendez-vous et consultation éventuellement liée. */
appointmentsRouter.get(
  '/:id',
  authenticate,
  requirePermission('appointment:read'),
  validate({ params: controller.idParamsSchema }),
  controller.detail,
);

/** Changement de statut (le motif est contrôlé par le service). */
appointmentsRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('appointment:update'),
  validate({ params: controller.idParamsSchema, body: appointmentStatusSchema }),
  auditTrail('UPDATE', 'appointment'),
  controller.updateStatus,
);

/** Mise à jour partielle, replanification comprise. */
appointmentsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('appointment:update'),
  validate({ params: controller.idParamsSchema, body: updateAppointmentSchema }),
  auditTrail('UPDATE', 'appointment'),
  controller.update,
);

/** Suppression définitive (204). */
appointmentsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('appointment:delete'),
  validate({ params: controller.idParamsSchema }),
  auditTrail('DELETE', 'appointment'),
  controller.remove,
);

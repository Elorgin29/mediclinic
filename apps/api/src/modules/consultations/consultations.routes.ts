/**
 * Routes du module « consultations », montées sur `/api/consultations`.
 *
 * Ordre de déclaration important : `/patient/:patientId` est déclaré AVANT
 * `/:id`, sinon Express interpréterait « patient » comme un identifiant de
 * consultation.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 * La validation Zod est branchée ici pour que le contrôleur ne reçoive que des
 * valeurs déjà converties (identifiants numériques compris).
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './consultations.controller.js';

export const consultationsRouter = Router();

/* -------------------------------------------------------------------------- */
/* Collection                                                                  */
/* -------------------------------------------------------------------------- */

/** Liste paginée et filtrée des consultations. */
consultationsRouter.get('/', authenticate, requirePermission('consultation:read'), controller.list);

/** Saisie d'un compte-rendu (le rendez-vous passe à `COMPLETED`). */
consultationsRouter.post(
  '/',
  authenticate,
  requirePermission('consultation:create'),
  validate({ body: controller.createConsultationSchema }),
  auditTrail('CREATE', 'consultation'),
  controller.create,
);

/* -------------------------------------------------------------------------- */
/* Consultations d'un patient — déclaré avant `/:id`                          */
/* -------------------------------------------------------------------------- */

/** Consultations d'un patient, de la plus récente à la plus ancienne. */
consultationsRouter.get(
  '/patient/:patientId',
  authenticate,
  requirePermission('consultation:read'),
  validate({ params: controller.patientIdParamsSchema }),
  controller.byPatient,
);

/* -------------------------------------------------------------------------- */
/* Ressource individuelle                                                      */
/* -------------------------------------------------------------------------- */

/** Détail d'une consultation, ordonnances incluses. */
consultationsRouter.get(
  '/:id',
  authenticate,
  requirePermission('consultation:read'),
  validate({ params: controller.consultationIdParamsSchema }),
  controller.detail,
);

/** Mise à jour du diagnostic, des notes ou de la date de suivi. */
consultationsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('consultation:update'),
  validate({
    params: controller.consultationIdParamsSchema,
    body: controller.updateConsultationSchema,
  }),
  auditTrail('UPDATE', 'consultation'),
  controller.update,
);

/** Suppression définitive (204). */
consultationsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('consultation:delete'),
  validate({ params: controller.consultationIdParamsSchema }),
  auditTrail('DELETE', 'consultation'),
  controller.remove,
);

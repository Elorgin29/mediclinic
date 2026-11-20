/**
 * Routes du module ordonnances, montées sur `/api/prescriptions`.
 *
 * Ordre de déclaration impératif : `/patient/:patientId` est enregistré AVANT
 * `/:id`, sinon Express interpréterait « patient » comme un identifiant
 * d'ordonnance.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 * Les corps et query strings sont validés par les schémas partagés ; seuls les
 * remplacements de lignes (`PATCH /:id`) sont complétés localement, faute de
 * schéma partagé dédié.
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './prescriptions.controller.js';

export const prescriptionsRouter = Router();

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée des ordonnances. */
prescriptionsRouter.get(
  '/',
  authenticate,
  requirePermission('prescription:read'),
  controller.list,
);

/**
 * Ordonnances du patient connecté (portail patient). Déclaré avant `/:id`.
 */
prescriptionsRouter.get('/me', authenticate, controller.mine);

/**
 * Ordonnances d'un patient — déclaré avant `/:id` pour primer sur celui-ci.
 */
prescriptionsRouter.get(
  '/patient/:patientId',
  authenticate,
  requirePermission('prescription:read'),
  validate({ params: controller.patientParamsSchema }),
  controller.listByPatient,
);

/** Détail d'une ordonnance et de ses lignes. */
prescriptionsRouter.get(
  '/:id',
  authenticate,
  requirePermission('prescription:read'),
  validate({ params: controller.idParamsSchema }),
  controller.detail,
);

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/** Rédaction d'une ordonnance (transaction ordonnance + lignes). */
prescriptionsRouter.post(
  '/',
  authenticate,
  requirePermission('prescription:create'),
  auditTrail('CREATE', 'prescription'),
  controller.create,
);

/**
 * Dispensation : c'est la seule voie qui fait sortir du stock. Le corps est
 * ignoré (l'identifiant suffit) ; `dispenseSchema` n'est donc pas requis ici.
 */
prescriptionsRouter.post(
  '/:id/dispense',
  authenticate,
  requirePermission('prescription:manage'),
  validate({ params: controller.idParamsSchema }),
  auditTrail('DISPENSE', 'prescription'),
  controller.dispense,
);

/** Changement de statut et/ou remplacement des lignes. */
prescriptionsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('prescription:update'),
  validate({ params: controller.idParamsSchema }),
  auditTrail('UPDATE', 'prescription'),
  controller.update,
);

/** Suppression (annulation logique si l'ordonnance a déjà été dispensée). */
prescriptionsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('prescription:delete'),
  validate({ params: controller.idParamsSchema }),
  auditTrail('DELETE', 'prescription'),
  controller.remove,
);

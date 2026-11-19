/**
 * Routes du module laboratoire, montées sur `/api/lab`.
 *
 * Ordre de déclaration important : `/requests/patient/:patientId` est déclaré
 * AVANT `/requests/:id`, sinon Express interpréterait « patient » comme un
 * identifiant de demande.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → auditTrail → contrôleur
 * (validation Zod assurée par le contrôleur avec les schémas partagés).
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './lab.controller.js';

export const labRouter = Router();

/* -------------------------------------------------------------------------- */
/* Catalogue des analyses                                                      */
/* -------------------------------------------------------------------------- */

/** Catalogue des analyses. */
labRouter.get('/tests', authenticate, requirePermission('lab:read'), controller.listTests);

/** Ajout d'une analyse au catalogue. */
labRouter.post(
  '/tests',
  authenticate,
  requirePermission('lab:create'),
  auditTrail('CREATE', 'lab'),
  controller.createTest,
);

/** Modification d'une analyse du catalogue. */
labRouter.patch(
  '/tests/:id',
  authenticate,
  requirePermission('lab:update'),
  auditTrail('UPDATE', 'lab'),
  controller.updateTest,
);

/* -------------------------------------------------------------------------- */
/* Demandes d'analyse                                                          */
/* -------------------------------------------------------------------------- */

/** Liste paginée des demandes. */
labRouter.get(
  '/requests',
  authenticate,
  requirePermission('lab:read'),
  controller.listRequests,
);

/** Prescription d'une analyse. */
labRouter.post(
  '/requests',
  authenticate,
  requirePermission('lab:create'),
  auditTrail('CREATE', 'lab'),
  controller.createRequest,
);

/** Demandes d'un patient — déclaré avant `/:id` pour primer sur celui-ci. */
labRouter.get(
  '/requests/patient/:patientId',
  authenticate,
  requirePermission('lab:read'),
  controller.requestsByPatient,
);

/** Détail d'une demande. */
labRouter.get(
  '/requests/:id',
  authenticate,
  requirePermission('lab:read'),
  controller.requestDetail,
);

/** Mise à jour d'une demande (statut, résultat). */
labRouter.patch(
  '/requests/:id',
  authenticate,
  requirePermission('lab:update'),
  auditTrail('UPDATE', 'lab'),
  controller.updateRequest,
);

/** Annulation ou suppression d'une demande. */
labRouter.delete(
  '/requests/:id',
  authenticate,
  requirePermission('lab:delete'),
  auditTrail('DELETE', 'lab'),
  controller.deleteRequest,
);

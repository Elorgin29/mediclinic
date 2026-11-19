/**
 * Routes du journal d'audit (`/api/audit`).
 *
 * Ordre de déclaration : `/stats` AVANT `/:id`, sinon Express interpréterait
 * « stats » comme un identifiant numérique.
 *
 * Toutes les routes exigent `audit:read` — y compris `POST /`, qui écrit une
 * entrée mais ne permet aucune modification du journal existant.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './audit.controller.js';

export const auditRouter = Router();

/** Liste paginée du journal (filtres utilisateur, ressource, action, période). */
auditRouter.get(
  '/',
  authenticate,
  requirePermission('audit:read'),
  validate({ query: controller.auditListQuerySchema }),
  controller.list,
);

/** Statistiques du journal — AVANT `/:id`. */
auditRouter.get(
  '/stats',
  authenticate,
  requirePermission('audit:read'),
  controller.stats,
);

/** Détail d'une entrée. */
auditRouter.get(
  '/:id',
  authenticate,
  requirePermission('audit:read'),
  validate({ params: controller.auditIdParamsSchema }),
  controller.getById,
);

/**
 * Journalisation d'une action côté client.
 * L'auteur est l'utilisateur authentifié ; l'écriture passe par
 * `writeAuditLog` comme le reste de l'application.
 */
auditRouter.post(
  '/',
  authenticate,
  requirePermission('audit:read'),
  validate({ body: controller.clientAuditSchema }),
  controller.create,
);

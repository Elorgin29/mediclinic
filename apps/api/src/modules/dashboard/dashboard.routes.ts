/**
 * Routes du tableau de bord (`/api/dashboard`).
 *
 * Toutes les routes exigent la permission `dashboard:read`. Aucune n'est
 * modificatrice : le middleware `auditTrail` n'est donc pas utilisé.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './dashboard.controller.js';

export const dashboardRouter = Router();

/** Indicateurs + graphiques de la page d'accueil. */
dashboardRouter.get('/stats', authenticate, requirePermission('dashboard:read'), controller.stats);

/** Séries des graphiques uniquement. */
dashboardRouter.get('/charts', authenticate, requirePermission('dashboard:read'), controller.charts);

/** Dernières entrées du journal d'audit (pagination optionnelle). */
dashboardRouter.get(
  '/activity',
  authenticate,
  requirePermission('dashboard:read'),
  controller.activity,
);

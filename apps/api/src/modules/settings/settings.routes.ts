/**
 * Routes des paramètres de la clinique, montées sur `/api/settings`.
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './settings.controller.js';

export const settingsRouter = Router();

/** Lecture des paramètres (nécessaire à l'affichage de l'identité de la clinique). */
settingsRouter.get('/', authenticate, requirePermission('settings:read'), controller.read);

/** Modification des paramètres (réservée aux administrateurs). */
settingsRouter.patch(
  '/',
  authenticate,
  requirePermission('settings:update'),
  auditTrail('UPDATE', 'settings'),
  controller.update,
);

/**
 * Routes du référentiel des permissions, montées sur `/api/permissions`.
 *
 * Toutes les routes exigent `role:read` : la connaissance fine du référentiel
 * n'est utile qu'aux profils chargés de l'administration des droits.
 */

import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import * as controller from './permissions.controller.js';

export const permissionsRouter = Router();

/** Toutes les permissions à plat. */
permissionsRouter.get('/', authenticate, requirePermission('role:read'), controller.list);

/** Permissions regroupées par ressource (écran de matrice). */
permissionsRouter.get('/grouped', authenticate, requirePermission('role:read'), controller.grouped);

/** Matrice rôle → permissions complète. */
permissionsRouter.get('/matrix', authenticate, requirePermission('role:read'), controller.matrix);

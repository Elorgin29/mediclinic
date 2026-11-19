/**
 * Routes du module « gardes » (`/api/shifts`).
 *
 * Les chemins littéraux (`/calendar`, `/me`) sont déclarés AVANT `/:id` :
 * Express teste les routes dans l'ordre de déclaration, sinon `/calendar`
 * serait interprété comme un identifiant.
 */

import { Router } from 'express';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './shifts.controller.js';

export const shiftsRouter = Router();

/** Liste paginée des gardes (filtres médecin, département, type, statut, période). */
shiftsRouter.get(
  '/',
  authenticate,
  requirePermission('shift:read'),
  validate({ query: controller.shiftListQuerySchema }),
  controller.list,
);

/** Planning sur une plage de dates (mois courant par défaut). */
shiftsRouter.get(
  '/calendar',
  authenticate,
  requirePermission('shift:read'),
  validate({ query: controller.shiftCalendarRangeSchema }),
  controller.calendar,
);

/** Gardes du médecin connecté (route réservée au profil médecin). */
shiftsRouter.get('/me', authenticate, controller.mine);

/** Détail d'une garde. */
shiftsRouter.get('/:id', authenticate, requirePermission('shift:read'), controller.getById);

/** Création d'une garde. */
shiftsRouter.post(
  '/',
  authenticate,
  requirePermission('shift:create'),
  validate({ body: controller.createShiftSchema }),
  auditTrail('CREATE', 'shift'),
  controller.create,
);

/** Modification d'une garde. */
shiftsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('shift:update'),
  validate({ body: controller.updateShiftSchema }),
  auditTrail('UPDATE', 'shift'),
  controller.update,
);

/** Suppression d'une garde. */
shiftsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('shift:delete'),
  auditTrail('DELETE', 'shift'),
  controller.remove,
);
